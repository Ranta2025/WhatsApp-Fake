package handlers

import (
	"bytes"
	"context"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gorm/backend/models"
	"gorm/backend/services"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

const stickerTestTel = "+51999000999"

// MockStickerService implementa services.StickerLibraryServicer para los tests
// del handler de stickers.
type MockStickerService struct{ mock.Mock }

func (m *MockStickerService) UploadSticker(telephon, tags string, file multipart.File, header *multipart.FileHeader, ctx context.Context) (models.StickerResponse, bool, error) {
	args := m.Called(telephon, tags, file, header, ctx)
	return args.Get(0).(models.StickerResponse), args.Bool(1), args.Error(2)
}

func (m *MockStickerService) SaveSticker(telephon, url string, ctx context.Context) (models.StickerResponse, bool, error) {
	args := m.Called(telephon, url, ctx)
	return args.Get(0).(models.StickerResponse), args.Bool(1), args.Error(2)
}

func (m *MockStickerService) ListStickers(telephon string, ctx context.Context) (models.StickerLibraryResponse, error) {
	args := m.Called(telephon, ctx)
	return args.Get(0).(models.StickerLibraryResponse), args.Error(1)
}

func (m *MockStickerService) SetFavorite(telephon, url string, favorite bool, ctx context.Context) error {
	return m.Called(telephon, url, favorite, ctx).Error(0)
}

func (m *MockStickerService) DeleteSticker(telephon string, id uint, ctx context.Context) error {
	return m.Called(telephon, id, ctx).Error(0)
}

func stickerCtx(method, body string, sets map[string]any) (*httptest.ResponseRecorder, *gin.Context) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, "/api/v1/stickers", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	for k, v := range sets {
		c.Set(k, v)
	}
	return w, c
}

func stickerUploadRequest(t *testing.T, content []byte, tags string) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	fw, err := w.CreateFormFile("file", "sticker.webp")
	require.NoError(t, err)
	_, err = fw.Write(content)
	require.NoError(t, err)
	if tags != "" {
		require.NoError(t, w.WriteField("tags", tags))
	}
	require.NoError(t, w.Close())

	req := httptest.NewRequest("POST", "/api/v1/stickers", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	return req
}

func TestHandlerStickerUploadStatusAndOwner(t *testing.T) {
	cases := []struct {
		name    string
		created bool
		want    int
	}{
		{"nuevo", true, http.StatusCreated},
		{"existente", false, http.StatusOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := new(MockStickerService)
			w, c := stickerCtx("POST", "", map[string]any{"telephon": stickerTestTel})
			c.Request = stickerUploadRequest(t, []byte("bytes"), "hola,mundo")
			svc.On("UploadSticker", stickerTestTel, "hola,mundo", mock.Anything, mock.Anything, mock.Anything).
				Return(models.StickerResponse{ID: 1, URL: "u", SHA256: "s", Tags: []string{"hola", "mundo"}}, tc.created, nil)

			InitHandlerSticker(svc).HandlerUploadSticker()(c)

			assert.Equal(t, tc.want, w.Code)
			assert.JSONEq(t, `{"id":1,"url":"u","sha256":"s","animated":false,"favorite":false,"tags":["hola","mundo"],"createdAt":"0001-01-01T00:00:00Z"}`, w.Body.String())
			svc.AssertExpectations(t)
		})
	}
}

// RF2: el mapeo de errores de la subida en el borde HTTP. El tope es 409, los
// rechazos de validación 400, un sticker ajeno/inexistente 404 y un fallo interno
// 500 genérico (sin filtrar el texto).
func TestHandlerStickerUploadErrorMapping(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"tope alcanzado", services.ErrStickerLimit, http.StatusConflict},
		{"archivo inválido", services.ErrStickerInvalid, http.StatusBadRequest},
		{"url a favoritos", services.ErrStickerBuiltinFavorite, http.StatusBadRequest},
		{"url inválida", services.ErrStickerSaveURLInvalid, http.StatusBadRequest},
		{"favorito inválido", services.ErrStickerFavoriteInvalid, http.StatusBadRequest},
		{"no encontrado", models.ErrStickerNotFound, http.StatusNotFound},
		{"interno", errors.New("boom"), http.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := new(MockStickerService)
			w, c := stickerCtx("POST", "", map[string]any{"telephon": stickerTestTel})
			c.Request = stickerUploadRequest(t, []byte("bytes"), "")
			svc.On("UploadSticker", stickerTestTel, "", mock.Anything, mock.Anything, mock.Anything).
				Return(models.StickerResponse{}, false, tc.err)

			InitHandlerSticker(svc).HandlerUploadSticker()(c)

			assert.Equal(t, tc.want, w.Code, w.Body.String())
			if tc.want == http.StatusInternalServerError {
				assert.NotContains(t, w.Body.String(), "boom", "el detalle interno no se filtra")
			}
			svc.AssertExpectations(t)
		})
	}
}

func TestHandlerStickerUploadMissingFile(t *testing.T) {
	svc := new(MockStickerService)
	w, c := stickerCtx("POST", "", map[string]any{"telephon": stickerTestTel})
	c.Request = httptest.NewRequest("POST", "/api/v1/stickers", strings.NewReader("not multipart"))

	InitHandlerSticker(svc).HandlerUploadSticker()(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	svc.AssertNotCalled(t, "UploadSticker", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestHandlerStickerUploadTooLarge(t *testing.T) {
	svc := new(MockStickerService)
	w, c := stickerCtx("POST", "", map[string]any{"telephon": stickerTestTel})
	c.Request = stickerUploadRequest(t, bytes.Repeat([]byte("a"), maxStickerUploadBody+1024), "")

	InitHandlerSticker(svc).HandlerUploadSticker()(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	svc.AssertNotCalled(t, "UploadSticker", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestHandlerStickerUploadNoAuth(t *testing.T) {
	svc := new(MockStickerService)
	w, c := stickerCtx("POST", "", nil)
	c.Request = stickerUploadRequest(t, []byte("bytes"), "")

	InitHandlerSticker(svc).HandlerUploadSticker()(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	svc.AssertNotCalled(t, "UploadSticker", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestHandlerStickerSaveErrors(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"ok", nil, http.StatusOK},
		{"integrado", services.ErrStickerBuiltinFavorite, http.StatusBadRequest},
		{"url inválida", services.ErrStickerSaveURLInvalid, http.StatusBadRequest},
		{"no existe", models.ErrStickerNotFound, http.StatusNotFound},
		{"interno", errors.New("boom"), http.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := new(MockStickerService)
			w, c := stickerCtx("POST", `{"url":"u"}`, map[string]any{"telephon": stickerTestTel})
			svc.On("SaveSticker", stickerTestTel, "u", mock.Anything).
				Return(models.StickerResponse{ID: 1, URL: "u"}, false, tc.err)

			InitHandlerSticker(svc).HandlerSaveSticker()(c)

			assert.Equal(t, tc.want, w.Code, w.Body.String())
			svc.AssertExpectations(t)
		})
	}
}

func TestHandlerStickerListCamelCase(t *testing.T) {
	svc := new(MockStickerService)
	w, c := stickerCtx("GET", "", map[string]any{"telephon": stickerTestTel})
	svc.On("ListStickers", stickerTestTel, mock.Anything).Return(models.StickerLibraryResponse{
		Mine:      []models.StickerResponse{{ID: 1, URL: "u", SHA256: "s", Tags: []string{"hola"}}},
		Favorites: []models.StickerFavoriteItem{{URL: "/stickers/basic/hola.webp"}},
		Recents:   []models.StickerRecentItem{{URL: "u"}},
	}, nil)

	InitHandlerSticker(svc).HandlerListStickers()(c)

	require.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"mine"`)
	assert.Contains(t, w.Body.String(), `"favorites"`)
	assert.Contains(t, w.Body.String(), `"recents"`)
	assert.Contains(t, w.Body.String(), `"sha256"`)
}

func TestHandlerStickerFavoriteStatuses(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"ok", nil, http.StatusNoContent},
		{"no válido", services.ErrStickerFavoriteInvalid, http.StatusBadRequest},
		{"interno", errors.New("boom"), http.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := new(MockStickerService)
			w, c := stickerCtx("PUT", `{"url":"u","favorite":true}`, map[string]any{"telephon": stickerTestTel})
			svc.On("SetFavorite", stickerTestTel, "u", true, mock.Anything).Return(tc.err)

			InitHandlerSticker(svc).HandlerSetFavorite()(c)

			assert.Equal(t, tc.want, w.Code)
			svc.AssertExpectations(t)
		})
	}
}

func TestHandlerStickerDeleteStatuses(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"ok", nil, http.StatusNoContent},
		{"ajeno", models.ErrStickerNotFound, http.StatusNotFound},
		{"interno", errors.New("boom"), http.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := new(MockStickerService)
			w, c := stickerCtx("DELETE", "", map[string]any{"telephon": stickerTestTel})
			c.Params = gin.Params{{Key: "id", Value: "5"}}
			svc.On("DeleteSticker", stickerTestTel, uint(5), mock.Anything).Return(tc.err)

			InitHandlerSticker(svc).HandlerDeleteSticker()(c)

			assert.Equal(t, tc.want, w.Code)
			svc.AssertExpectations(t)
		})
	}
}

func TestHandlerStickerDeleteInvalidID(t *testing.T) {
	svc := new(MockStickerService)
	w, c := stickerCtx("DELETE", "", map[string]any{"telephon": stickerTestTel})
	c.Params = gin.Params{{Key: "id", Value: "abc"}}

	InitHandlerSticker(svc).HandlerDeleteSticker()(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	svc.AssertNotCalled(t, "DeleteSticker", mock.Anything, mock.Anything, mock.Anything)
}

func TestHandlerStickerSaveRequiresURL(t *testing.T) {
	svc := new(MockStickerService)
	w, c := stickerCtx("POST", `{}`, map[string]any{"telephon": stickerTestTel})

	InitHandlerSticker(svc).HandlerSaveSticker()(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	svc.AssertNotCalled(t, "SaveSticker", mock.Anything, mock.Anything, mock.Anything)
}
