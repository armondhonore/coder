package nats

import (
	"context"
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/coder/coder/v2/coderd/cryptokeys"
	"github.com/coder/coder/v2/coderd/database/dbtestutil"
	"github.com/coder/coder/v2/testutil"
)

// TestPubsub_ClusterTLS_RealCA stands up a three-node TLS mesh whose trust
// root is a real CA fetched from cryptokeys (create-at-fetch against a real
// DB), then verifies a cross-route publish/subscribe round-trip. This
// exercises the integration seam between the cryptokeys CA and the x/nats
// cluster TLS constructor, including the real PEM/x509 round-trip that the
// synthetic generateTestCA helper does not cover.
//
// The three-node star topology (b and c both peer with a, message flows
// b -> a -> c) mirrors TestPubsub_ClusterTLS/Mesh. A two-node single-route
// topology is avoided because route-interest propagation across a lone NATS
// route is timing-sensitive and makes such tests flaky.
func TestPubsub_ClusterTLS_RealCA(t *testing.T) {
	t.Parallel()

	db, _ := dbtestutil.NewDB(t)
	ctx := testutil.Context(t, testutil.WaitLong)

	// Real CA from the cryptokeys accessor. On an empty DB this creates the
	// nats_ca row under an advisory lock and returns the parsed cert+key.
	ca, err := cryptokeys.FetchNATSCA(ctx, db)
	require.NoError(t, err)

	// Nodes mesh on loopback, so the leaf IP-SAN must be 127.0.0.1. Driving
	// it through ClusterTLSOptionsFromRelayURL also exercises the production
	// seam (relay URL host -> SANHost).
	relayURL, err := url.Parse("nats://127.0.0.1:6222")
	require.NoError(t, err)
	tlsOpts, err := ClusterTLSOptionsFromRelayURL(relayURL, ca.Cert, ca.Key)
	require.NoError(t, err)

	opts := clusterTestOptions(t)
	opts.ClusterTLS = tlsOpts

	a := newTestPubsub(t, opts)
	b := newTestPubsub(t, opts)
	c := newTestPubsub(t, opts)

	addrA := clusterRouteAddress(t, a)
	require.NoError(t, b.setPeerAddresses([]string{addrA}))
	require.NoError(t, c.setPeerAddresses([]string{addrA}))

	received := make(chan string, 4)
	cancelSub, err := c.Subscribe("tls-realca", func(_ context.Context, msg []byte) {
		select {
		case received <- string(msg):
		default:
		}
	})
	require.NoError(t, err)
	defer cancelSub()

	// b -> a -> c crosses two TLS route hops (gossip meshes b and c
	// through a).
	waitForRouteSubscription(t, b, "tls-realca")
	require.NoError(t, b.Publish("tls-realca", []byte("hello")))
	require.Equal(t, "hello", testutil.TryReceive(ctx, t, received))
}
