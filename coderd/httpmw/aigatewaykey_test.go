package httpmw_test

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
	"golang.org/x/xerrors"

	"github.com/coder/coder/v2/coderd/apikey"
	"github.com/coder/coder/v2/coderd/database"
	"github.com/coder/coder/v2/coderd/database/dbmock"
	"github.com/coder/coder/v2/coderd/httpmw"
	"github.com/coder/coder/v2/codersdk"
)

func TestExtractAIGatewayKeyAuthenticated(t *testing.T) {
	t.Parallel()

	const secret = "this-is-a-test-gateway-key"

	t.Run("MissingHeader", func(t *testing.T) {
		t.Parallel()
		db := dbmock.NewMockStore(gomock.NewController(t))
		rw := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		newGatewayHandler(db, false).ServeHTTP(rw, r)
		require.Equal(t, http.StatusUnauthorized, rw.Code)
	})

	t.Run("InvalidKey", func(t *testing.T) {
		t.Parallel()
		db := dbmock.NewMockStore(gomock.NewController(t))
		db.EXPECT().GetAIGatewayKeyByHashedSecret(gomock.Any(), apikey.HashSecret(secret)).
			Return(database.AIGatewayKey{}, sql.ErrNoRows)
		rw := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set(codersdk.AIGatewayKeyHeader, secret)
		newGatewayHandler(db, false).ServeHTTP(rw, r)
		require.Equal(t, http.StatusUnauthorized, rw.Code)
	})

	t.Run("LookupError", func(t *testing.T) {
		t.Parallel()
		db := dbmock.NewMockStore(gomock.NewController(t))
		db.EXPECT().GetAIGatewayKeyByHashedSecret(gomock.Any(), apikey.HashSecret(secret)).
			Return(database.AIGatewayKey{}, xerrors.New("boom"))
		rw := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set(codersdk.AIGatewayKeyHeader, secret)
		newGatewayHandler(db, false).ServeHTTP(rw, r)
		require.Equal(t, http.StatusInternalServerError, rw.Code)
	})

	t.Run("Success", func(t *testing.T) {
		t.Parallel()
		db := dbmock.NewMockStore(gomock.NewController(t))
		key := database.AIGatewayKey{
			ID:           uuid.New(),
			Name:         "test-key",
			HashedSecret: apikey.HashSecret(secret),
		}
		db.EXPECT().GetAIGatewayKeyByHashedSecret(gomock.Any(), apikey.HashSecret(secret)).
			Return(key, nil)

		var (
			gotKey database.AIGatewayKey
			gotOK  bool
		)
		handler := httpmw.ExtractAIGatewayKeyAuthenticated(httpmw.ExtractAIGatewayKeyConfig{DB: db})(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotKey, gotOK = httpmw.AIGatewayKeyAuthOptional(r)
				w.WriteHeader(http.StatusOK)
			}),
		)

		rw := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set(codersdk.AIGatewayKeyHeader, secret)
		handler.ServeHTTP(rw, r)

		require.Equal(t, http.StatusOK, rw.Code)
		require.True(t, gotOK)
		require.Equal(t, key.ID, gotKey.ID)
	})

	t.Run("OptionalPassesThrough", func(t *testing.T) {
		t.Parallel()
		db := dbmock.NewMockStore(gomock.NewController(t))
		var called bool
		handler := httpmw.ExtractAIGatewayKeyAuthenticated(httpmw.ExtractAIGatewayKeyConfig{DB: db, Optional: true})(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, ok := httpmw.AIGatewayKeyAuthOptional(r)
				require.False(t, ok)
				called = true
				w.WriteHeader(http.StatusOK)
			}),
		)
		rw := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		handler.ServeHTTP(rw, r)
		require.Equal(t, http.StatusOK, rw.Code)
		require.True(t, called)
	})
}

func newGatewayHandler(db database.Store, optional bool) http.Handler {
	return httpmw.ExtractAIGatewayKeyAuthenticated(httpmw.ExtractAIGatewayKeyConfig{DB: db, Optional: optional})(
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)
}
