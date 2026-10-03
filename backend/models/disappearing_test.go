package models

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestValidDisappearSeconds(t *testing.T) {
	tests := []struct {
		name    string
		seconds int
		want    bool
	}{
		{"off", 0, true},
		{"24 hours", 86400, true},
		{"7 days", 604800, true},
		{"90 days", 7776000, true},
		{"negative", -86400, false},
		{"one second", 1, false},
		{"one hour", 3600, false},
		{"just above 90 days", 7776001, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ValidDisappearSeconds(tt.seconds); got != tt.want {
				t.Fatalf("ValidDisappearSeconds(%d) = %v, want %v", tt.seconds, got, tt.want)
			}
		})
	}
}

func TestErrInvalidDisappearDurationIsSentinel(t *testing.T) {
	if !errors.Is(ErrInvalidDisappearDuration, ErrInvalidDisappearDuration) {
		t.Fatal("sentinel must match itself")
	}
}

func TestOrderedPair(t *testing.T) {
	tests := []struct {
		name         string
		a, b         uint
		wantL, wantH uint
	}{
		{"already ordered", 1, 2, 1, 2},
		{"swapped", 9, 4, 4, 9},
		{"equal", 5, 5, 5, 5},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l, h := OrderedPair(tt.a, tt.b)
			if l != tt.wantL || h != tt.wantH {
				t.Fatalf("OrderedPair(%d,%d) = (%d,%d), want (%d,%d)", tt.a, tt.b, l, h, tt.wantL, tt.wantH)
			}
		})
	}
}

func TestSystemEventDisappearingChanged(t *testing.T) {
	if SystemEventDisappearingChanged != "disappearing_changed" {
		t.Fatalf("unexpected event %q", SystemEventDisappearingChanged)
	}
	if MessageKindSystem != GroupMessageKindSystem {
		t.Fatal("direct and group system kinds must align")
	}
}

func gormTag(t *testing.T, typ reflect.Type, field string) string {
	t.Helper()
	f, ok := typ.FieldByName(field)
	if !ok {
		t.Fatalf("%s must have field %s", typ.Name(), field)
	}
	return f.Tag.Get("gorm")
}

func TestMessageDisappearingFields(t *testing.T) {
	typ := reflect.TypeOf(Message{})
	if !strings.Contains(gormTag(t, typ, "Kind"), "default:''") {
		t.Fatal("Message.Kind must default to empty")
	}
	if !strings.Contains(gormTag(t, typ, "SystemEvent"), "not null") {
		t.Fatal("Message.SystemEvent must be not null")
	}
	f, _ := typ.FieldByName("ExpiresAt")
	if f.Type.Kind() != reflect.Ptr {
		t.Fatal("Message.ExpiresAt must be a nullable pointer")
	}
	g, _ := reflect.TypeOf(GroupMessage{}).FieldByName("ExpiresAt")
	if g.Type.Kind() != reflect.Ptr {
		t.Fatal("GroupMessage.ExpiresAt must be a nullable pointer")
	}
	if !strings.Contains(gormTag(t, reflect.TypeOf(Group{}), "DisappearSeconds"), "default:0") {
		t.Fatal("Group.DisappearSeconds must default to 0")
	}
}

func TestChatSettingAndMediaGCTags(t *testing.T) {
	cs := reflect.TypeOf(ChatSetting{})
	for _, f := range []string{"UserLowID", "UserHighID", "DisappearSeconds"} {
		if !strings.Contains(gormTag(t, cs, f), "not null") {
			t.Fatalf("ChatSetting.%s must be not null", f)
		}
	}
	if !strings.Contains(gormTag(t, cs, "UserLowID"), "uniqueIndex:idx_chat_settings_pair") ||
		!strings.Contains(gormTag(t, cs, "UserHighID"), "uniqueIndex:idx_chat_settings_pair") {
		t.Fatal("ChatSetting pair must share a unique composite index")
	}
	if got := (ChatSetting{}).TableName(); got != "chat_settings" {
		t.Fatalf("table name %q", got)
	}
	gc := reflect.TypeOf(MediaGC{})
	tag := gormTag(t, gc, "ObjectKey")
	if !strings.Contains(tag, "not null") || !strings.Contains(tag, "uniqueIndex") {
		t.Fatalf("MediaGC.ObjectKey must be not null + unique, got %q", tag)
	}
	if got := (MediaGC{}).TableName(); got != "media_gc" {
		t.Fatalf("table name %q", got)
	}
}
