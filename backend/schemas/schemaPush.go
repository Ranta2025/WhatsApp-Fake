package schemas

// PushConfigResponse es la respuesta de GET push/config. publicKey va vacío
// cuando el push está deshabilitado; preview es la preferencia efectiva del
// usuario (la global PUSH_PREVIEW y la suya deben estar activas).
type PushConfigResponse struct {
	Enabled   bool   `json:"enabled"`
	PublicKey string `json:"publicKey"`
	Preview   bool   `json:"preview"`
}
