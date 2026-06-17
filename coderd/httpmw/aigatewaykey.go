package httpmw

import (
	"context"
	"crypto/subtle"
	"net/http"

	"github.com/coder/coder/v2/coderd/apikey"
	"github.com/coder/coder/v2/coderd/database"
	"github.com/coder/coder/v2/coderd/database/dbauthz"
	"github.com/coder/coder/v2/coderd/httpapi"
	"github.com/coder/coder/v2/codersdk"
)

type aiGatewayKeyContextKey struct{}

// AIGatewayKeyAuthOptional returns the AI Gateway key that authenticated the
// request, if any. The key is used by the /serve handler to record liveness
// against the authenticating key.
func AIGatewayKeyAuthOptional(r *http.Request) (database.AIGatewayKey, bool) {
	key, ok := r.Context().Value(aiGatewayKeyContextKey{}).(database.AIGatewayKey)
	return key, ok
}

// ExtractAIGatewayKeyConfig configures ExtractAIGatewayKeyAuthenticated.
type ExtractAIGatewayKeyConfig struct {
	DB database.Store
	// Optional, when true, allows the request to proceed unauthenticated. The
	// next handler can detect authentication via AIGatewayKeyAuthOptional.
	Optional bool
}

// ExtractAIGatewayKeyAuthenticated authenticates a request as a standalone AI
// Gateway replica using the X-AI-Governance-Gateway-Key header. The header
// value is hashed and compared against the ai_gateway_keys table, mirroring the
// external provisioner daemon key flow in
// ExtractProvisionerDaemonAuthenticated.
//
// One key may authenticate many replicas at once; keys are not unique per
// connection. A deleted key fails the next reconnect because the row no longer
// exists, but does not disconnect sessions already established.
func ExtractAIGatewayKeyAuthenticated(opts ExtractAIGatewayKeyConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()

			handleOptional := func(code int, response codersdk.Response) {
				if opts.Optional {
					next.ServeHTTP(w, r)
					return
				}
				httpapi.Write(ctx, w, code, response)
			}

			key := r.Header.Get(codersdk.AIGatewayKeyHeader)
			if key == "" {
				handleOptional(http.StatusUnauthorized, codersdk.Response{
					Message: "AI Gateway key required.",
				})
				return
			}

			hashedKey := apikey.HashSecret(key)
			// nolint:gocritic // System must look up the AI Gateway key to authenticate the request.
			gatewayKey, err := opts.DB.GetAIGatewayKeyByHashedSecret(dbauthz.AsSystemRestricted(ctx), hashedKey)
			if err != nil {
				if httpapi.Is404Error(err) {
					handleOptional(http.StatusUnauthorized, codersdk.Response{
						Message: "AI Gateway key invalid.",
					})
					return
				}
				handleOptional(http.StatusInternalServerError, codersdk.Response{
					Message: "Failed to look up AI Gateway key.",
					Detail:  err.Error(),
				})
				return
			}

			// Defense in depth: the lookup already matches on hashed_secret, but
			// confirm equality in constant time to avoid relying solely on the
			// query.
			if subtle.ConstantTimeCompare(gatewayKey.HashedSecret, hashedKey) != 1 {
				handleOptional(http.StatusUnauthorized, codersdk.Response{
					Message: "AI Gateway key invalid.",
				})
				return
			}

			ctx = context.WithValue(ctx, aiGatewayKeyContextKey{}, gatewayKey)
			// nolint:gocritic // Authenticating as an AI Gateway replica, which
			// acts as the AI Bridge daemon.
			ctx = dbauthz.AsAIBridged(ctx)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
