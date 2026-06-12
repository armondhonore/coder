package cryptokeys

import (
	"crypto/x509"
	"database/sql"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/coder/coder/v2/coderd/database"
	"github.com/coder/coder/v2/coderd/database/dbgen"
	"github.com/coder/coder/v2/coderd/database/dbtestutil"
	"github.com/coder/coder/v2/testutil"
)

func TestCASecretRoundTrip(t *testing.T) {
	t.Parallel()

	now := time.Now().UTC().Truncate(time.Second)
	secret, err := generateCASecret(now)
	require.NoError(t, err)

	cert, signer, err := parseCASecret(secret)
	require.NoError(t, err)

	require.True(t, cert.IsCA)
	require.True(t, cert.BasicConstraintsValid)
	require.True(t, cert.MaxPathLenZero)
	require.Equal(t, x509.KeyUsageCertSign, cert.KeyUsage)
	require.Equal(t, now.Add(-time.Hour), cert.NotBefore)
	require.Equal(t, now.Add(DefaultKeyDuration+NATSCATokenDuration+time.Hour), cert.NotAfter)
	require.Equal(t, cert.PublicKey, signer.Public())

	// The cert must be able to verify itself as a trust root.
	pool := x509.NewCertPool()
	pool.AddCert(cert)
	_, err = cert.Verify(x509.VerifyOptions{Roots: pool})
	require.NoError(t, err)
}

func TestParseCASecretErrors(t *testing.T) {
	t.Parallel()

	_, _, err := parseCASecret("")
	require.ErrorContains(t, err, "no certificate")

	_, _, err = parseCASecret("not pem at all")
	require.ErrorContains(t, err, "no certificate")
}

func TestFetchNATSCA(t *testing.T) {
	t.Parallel()

	t.Run("CreatesWhenMissing", func(t *testing.T) {
		t.Parallel()

		db, _ := dbtestutil.NewDB(t)
		ctx := testutil.Context(t, testutil.WaitShort)

		ca, err := FetchNATSCA(ctx, db)
		require.NoError(t, err)
		require.NotNil(t, ca.Cert)
		require.NotNil(t, ca.Key)
		require.Len(t, ca.TrustBundle, 1)
		require.Equal(t, ca.Cert, ca.TrustBundle[0])

		// A second fetch returns the same CA without inserting another row.
		again, err := FetchNATSCA(ctx, db)
		require.NoError(t, err)
		require.Equal(t, ca.Sequence, again.Sequence)
		require.Equal(t, ca.Cert.Raw, again.Cert.Raw)

		keys, err := db.GetCryptoKeysByFeature(ctx, database.CryptoKeyFeatureNatsCa)
		require.NoError(t, err)
		require.Len(t, keys, 1)
	})

	t.Run("ConcurrentCreate", func(t *testing.T) {
		t.Parallel()

		db, _ := dbtestutil.NewDB(t)
		ctx := testutil.Context(t, testutil.WaitLong)

		const fetchers = 8
		cas := make([]*NATSCA, fetchers)
		errs := make([]error, fetchers)
		var wg sync.WaitGroup
		for i := range fetchers {
			wg.Add(1)
			go func() {
				defer wg.Done()
				cas[i], errs[i] = FetchNATSCA(ctx, db)
			}()
		}
		wg.Wait()

		for i := range fetchers {
			require.NoError(t, errs[i])
			require.Equal(t, cas[0].Sequence, cas[i].Sequence)
			require.Equal(t, cas[0].Cert.Raw, cas[i].Cert.Raw)
		}

		keys, err := db.GetCryptoKeysByFeature(ctx, database.CryptoKeyFeatureNatsCa)
		require.NoError(t, err)
		require.Len(t, keys, 1)
	})

	t.Run("RotationOverlap", func(t *testing.T) {
		t.Parallel()

		db, _ := dbtestutil.NewDB(t)
		ctx := testutil.Context(t, testutil.WaitShort)
		now := time.Now().UTC()

		// Old CA scheduled for deletion in the future: still a trust root,
		// no longer the active signer.
		oldKey := dbgen.CryptoKey(t, db, database.CryptoKey{
			Feature:   database.CryptoKeyFeatureNatsCa,
			Sequence:  1,
			StartsAt:  now.Add(-2 * time.Hour),
			DeletesAt: sql.NullTime{Time: now.Add(time.Hour), Valid: true},
		})
		newKey := dbgen.CryptoKey(t, db, database.CryptoKey{
			Feature:  database.CryptoKeyFeatureNatsCa,
			Sequence: 2,
			StartsAt: now.Add(-time.Hour),
		})
		// Deleted key: excluded entirely.
		deletedKey := dbgen.CryptoKey(t, db, database.CryptoKey{
			Feature:   database.CryptoKeyFeatureNatsCa,
			Sequence:  3,
			StartsAt:  now.Add(-3 * time.Hour),
			DeletesAt: sql.NullTime{Time: now.Add(-time.Hour), Valid: true},
		})

		ca, err := FetchNATSCA(ctx, db)
		require.NoError(t, err)
		require.Equal(t, newKey.Sequence, ca.Sequence)

		newCert, _, err := parseCASecret(newKey.Secret.String)
		require.NoError(t, err)
		oldCert, _, err := parseCASecret(oldKey.Secret.String)
		require.NoError(t, err)
		deletedCert, _, err := parseCASecret(deletedKey.Secret.String)
		require.NoError(t, err)

		require.Equal(t, newCert.Raw, ca.Cert.Raw)
		require.Len(t, ca.TrustBundle, 2)
		bundle := [][]byte{ca.TrustBundle[0].Raw, ca.TrustBundle[1].Raw}
		require.Contains(t, bundle, newCert.Raw)
		require.Contains(t, bundle, oldCert.Raw)
		require.NotContains(t, bundle, deletedCert.Raw)
	})

	t.Run("FutureKeyNotActive", func(t *testing.T) {
		t.Parallel()

		db, _ := dbtestutil.NewDB(t)
		ctx := testutil.Context(t, testutil.WaitShort)
		now := time.Now().UTC()

		current := dbgen.CryptoKey(t, db, database.CryptoKey{
			Feature:  database.CryptoKeyFeatureNatsCa,
			Sequence: 1,
			StartsAt: now.Add(-time.Hour),
		})
		// A rotated-in key that hasn't started yet must not be the active
		// signer, but its cert belongs in the trust bundle.
		_ = dbgen.CryptoKey(t, db, database.CryptoKey{
			Feature:  database.CryptoKeyFeatureNatsCa,
			Sequence: 2,
			StartsAt: now.Add(time.Hour),
		})

		ca, err := FetchNATSCA(ctx, db)
		require.NoError(t, err)
		require.Equal(t, current.Sequence, ca.Sequence)
		require.Len(t, ca.TrustBundle, 2)
	})
}
