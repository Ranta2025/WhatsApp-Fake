package utils

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"net"

	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
)

// IsInternalError indica si err (o algo de su cadena de %w) es un fallo de
// infraestructura: driver/servidor Postgres, conexión, timeout o gorm. Su texto
// (SQL, nombres de tablas/columnas, hosts) no debe llegar nunca al cliente; solo
// debe quedar en el log del servidor. Los mensajes escritos a mano por los
// servicios y los sentinels de dominio no entran aquí.
func IsInternalError(err error) bool {
	if err == nil {
		return false
	}
	var pgErr *pgconn.PgError
	var connErr *pgconn.ConnectError
	var netErr net.Error
	switch {
	case errors.As(err, &pgErr), errors.As(err, &connErr), errors.As(err, &netErr):
		return true
	case errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled),
		errors.Is(err, sql.ErrConnDone), errors.Is(err, sql.ErrTxDone),
		errors.Is(err, driver.ErrBadConn),
		errors.Is(err, io.EOF), errors.Is(err, io.ErrUnexpectedEOF),
		errors.Is(err, gorm.ErrInvalidDB), errors.Is(err, gorm.ErrInvalidTransaction),
		errors.Is(err, gorm.ErrNotImplemented), errors.Is(err, gorm.ErrUnsupportedDriver):
		return true
	}
	return false
}
