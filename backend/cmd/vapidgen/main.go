// vapidgen imprime un par de claves VAPID nuevas en formato .env (make vapid-keys).
// Las claves no se guardan en ningún sitio: cópialas a tu .env.
package main

import (
	"fmt"
	"io"
	"os"

	webpush "github.com/SherClockHolmes/webpush-go"
)

func writeKeys(w io.Writer, generate func() (privateKey, publicKey string, err error)) error {
	priv, pub, err := generate()
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "VAPID_PUBLIC_KEY=%s\nVAPID_PRIVATE_KEY=%s\nVAPID_SUBJECT=mailto:admin@example.com\n", pub, priv)
	return err
}

func main() {
	if err := writeKeys(os.Stdout, webpush.GenerateVAPIDKeys); err != nil {
		fmt.Fprintln(os.Stderr, "vapidgen:", err)
		os.Exit(1)
	}
}
