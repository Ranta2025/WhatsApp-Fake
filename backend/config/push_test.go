package config

import "testing"

func envOf(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoadPushConfigDisabledWhenKeysMissing(t *testing.T) {
	cases := []map[string]string{
		{},
		{"VAPID_PUBLIC_KEY": "pub", "VAPID_PRIVATE_KEY": "priv"},
		{"VAPID_PUBLIC_KEY": "pub", "VAPID_SUBJECT": "mailto:a@b.c"},
		{"VAPID_PRIVATE_KEY": "priv", "VAPID_SUBJECT": "mailto:a@b.c"},
		{"VAPID_PUBLIC_KEY": " ", "VAPID_PRIVATE_KEY": "priv", "VAPID_SUBJECT": "mailto:a@b.c"},
	}
	for i, env := range cases {
		cfg := LoadPushConfig(envOf(env))
		if cfg.Enabled {
			t.Errorf("case %d: want disabled, got enabled", i)
		}
		if cfg.PublicKey != "" || cfg.PrivateKey != "" {
			t.Errorf("case %d: disabled config must not expose keys", i)
		}
	}
}

func TestLoadPushConfigRejectsInvalidSubject(t *testing.T) {
	for _, subj := range []string{"admin@example.com", "http://example.com", "ftp://x", "mailto:"} {
		cfg := LoadPushConfig(envOf(map[string]string{
			"VAPID_PUBLIC_KEY": "pub", "VAPID_PRIVATE_KEY": "priv", "VAPID_SUBJECT": subj,
		}))
		if cfg.Enabled {
			t.Errorf("subject %q: want disabled", subj)
		}
	}
}

func TestLoadPushConfigEnabled(t *testing.T) {
	for _, subj := range []string{"mailto:admin@example.com", "https://example.com/contact"} {
		cfg := LoadPushConfig(envOf(map[string]string{
			"VAPID_PUBLIC_KEY": " pub ", "VAPID_PRIVATE_KEY": "priv", "VAPID_SUBJECT": subj,
		}))
		if !cfg.Enabled {
			t.Fatalf("subject %q: want enabled", subj)
		}
		if cfg.PublicKey != "pub" || cfg.PrivateKey != "priv" || cfg.Subject != subj {
			t.Errorf("unexpected config %+v", cfg)
		}
		if !cfg.Preview {
			t.Errorf("preview must default to on")
		}
	}
}

func TestLoadPushConfigPreviewOverride(t *testing.T) {
	base := map[string]string{"VAPID_PUBLIC_KEY": "pub", "VAPID_PRIVATE_KEY": "priv", "VAPID_SUBJECT": "mailto:a@b.c"}
	for val, want := range map[string]bool{"off": false, "OFF": false, "false": false, "0": false, "on": true, "": true, "garbage": true} {
		env := map[string]string{"PUSH_PREVIEW": val}
		for k, v := range base {
			env[k] = v
		}
		if got := LoadPushConfig(envOf(env)).Preview; got != want {
			t.Errorf("PUSH_PREVIEW=%q: preview=%v, want %v", val, got, want)
		}
	}
}
