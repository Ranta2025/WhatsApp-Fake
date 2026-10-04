package main

import (
	"bytes"
	"errors"
	"strings"
	"testing"
)

func TestWriteKeysPrintsEnvLines(t *testing.T) {
	var buf bytes.Buffer
	err := writeKeys(&buf, func() (string, string, error) { return "PRIV", "PUB", nil })
	if err != nil {
		t.Fatal(err)
	}
	out := buf.String()
	for _, want := range []string{"VAPID_PUBLIC_KEY=PUB\n", "VAPID_PRIVATE_KEY=PRIV\n", "VAPID_SUBJECT=mailto:"} {
		if !strings.Contains(out, want) {
			t.Errorf("output missing %q:\n%s", want, out)
		}
	}
}

func TestWriteKeysPropagatesError(t *testing.T) {
	var buf bytes.Buffer
	if err := writeKeys(&buf, func() (string, string, error) { return "", "", errors.New("boom") }); err == nil {
		t.Fatal("want error")
	}
	if buf.Len() != 0 {
		t.Errorf("nothing should be printed on error")
	}
}
