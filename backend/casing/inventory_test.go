// Package casing guards the JSON wire contract during the api-casing cutover.
//
// AC0 (contract inventory test) is a pure, deterministic reflection test: it
// walks every registered response/request/WebSocket schema struct and fails when
// a JSON key is not lowerCamelCase. New fields added by later features are
// picked up automatically, so they cannot silently skip the contract.
//
// The allowlist below is the TEMPORARY set of keys that are still non-camel.
// It starts as the full current list and must shrink domain by domain until it
// is empty at the end of the api-casing work (AC3..AC7). A key that is renamed
// to camelCase (or removed) leaves the structs, so its allowlist entry becomes
// stale and the test fails until it is deleted.
//
// Scope / known gaps (documented, not asserted here):
//   - Only struct-based payloads are walked. Hand-built map[string]any payloads
//     are invisible to reflection; the domain tasks renamed those by hand
//     (group_delete_message, status_viewed/status_deleted), so today none carry
//     a non-camel key. A future task can add a static check when the maps are
//     converted to structs.
//   - Promoted fields from anonymous embedded structs declared OUTSIDE the
//     backend packages (for example gorm.Model) are skipped: they are not part
//     of the app JSON contract.
//   - Anonymous embedded structs declared inside the backend packages are
//     walked and their fields are treated as promoted (encoding/json promotes
//     untagged embedded fields).
//   - Request structs that double as GORM entities with relation fields
//     (models.UserDataBase, models.User) are intentionally NOT registered; the
//     wire-relevant request keys they bind (username/email/numero/password) are
//     camelCase already, and their entity/relation fields never reach the wire.
package casing

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strings"
	"testing"

	"gorm/backend/models"
	"gorm/backend/schemas"
)

// allowlist maps a still-non-camel JSON key to the api-casing domain that owns
// its rename. It MUST become empty by the end of the cutover.
var allowlist = map[string]string{
	// AC7 leftovers (bug-report request body).
	"user_email":  "AC7-leftovers",
	"screen_size": "AC7-leftovers",
}

// registry is the explicit inventory of wire-contract structs: every schema
// response, every request body and every struct-based WebSocket payload.
//
// Groups are documentation only; the test walks the types.
var registry = []reflect.Type{
	// ── backend/schemas: responses + WS payloads ───────────────────────────
	reflect.TypeOf((*schemas.UserGet)(nil)).Elem(),
	reflect.TypeOf((*schemas.Message)(nil)).Elem(),
	reflect.TypeOf((*schemas.ChatGroup)(nil)).Elem(),
	reflect.TypeOf((*schemas.GroupResponse)(nil)).Elem(),
	reflect.TypeOf((*schemas.GroupMemberResponse)(nil)).Elem(),
	reflect.TypeOf((*schemas.GroupMessageResponse)(nil)).Elem(),
	reflect.TypeOf((*schemas.GroupDetail)(nil)).Elem(),
	reflect.TypeOf((*schemas.GroupReceiptUpdate)(nil)).Elem(),
	reflect.TypeOf((*schemas.GroupMemberBrief)(nil)).Elem(),
	reflect.TypeOf((*schemas.GroupMessageReceipts)(nil)).Elem(),
	reflect.TypeOf((*schemas.GroupSettingsResult)(nil)).Elem(),
	reflect.TypeOf((*schemas.GroupInfoResult)(nil)).Elem(),
	reflect.TypeOf((*schemas.StatusItem)(nil)).Elem(),
	reflect.TypeOf((*schemas.StatusOwnerBrief)(nil)).Elem(),
	reflect.TypeOf((*schemas.StatusContactGroup)(nil)).Elem(),
	reflect.TypeOf((*schemas.StatusFeed)(nil)).Elem(),
	reflect.TypeOf((*schemas.StatusViewer)(nil)).Elem(),
	reflect.TypeOf((*schemas.CallLogResponse)(nil)).Elem(),
	reflect.TypeOf((*schemas.SearchResult)(nil)).Elem(),
	reflect.TypeOf((*schemas.SearchPage)(nil)).Elem(),
	reflect.TypeOf((*schemas.GlobalSearchChat)(nil)).Elem(),
	reflect.TypeOf((*schemas.GlobalSearchResponse)(nil)).Elem(),
	reflect.TypeOf((*schemas.MuteResponse)(nil)).Elem(),
	reflect.TypeOf((*schemas.PushConfigResponse)(nil)).Elem(),
	reflect.TypeOf((*schemas.ReactionSummary)(nil)).Elem(),
	reflect.TypeOf((*schemas.ReactionEvent)(nil)).Elem(),
	reflect.TypeOf((*schemas.ReactionUserResponse)(nil)).Elem(),
	reflect.TypeOf((*schemas.ReactionUsersResponse)(nil)).Elem(),
	reflect.TypeOf((*schemas.ReactionsResponse)(nil)).Elem(),
	reflect.TypeOf((*schemas.ReactionBody)(nil)).Elem(),

	// ── backend/models: request bodies + responses ─────────────────────────
	reflect.TypeOf((*models.UserLogin)(nil)).Elem(),
	reflect.TypeOf((*models.Username)(nil)).Elem(),
	reflect.TypeOf((*models.ContactAdd)(nil)).Elem(),
	reflect.TypeOf((*models.MessageGet)(nil)).Elem(),
	reflect.TypeOf((*models.MessageEdit)(nil)).Elem(),
	reflect.TypeOf((*models.MessageDelete)(nil)).Elem(),
	reflect.TypeOf((*models.MessageRead)(nil)).Elem(),
	reflect.TypeOf((*models.TypingIndicator)(nil)).Elem(),
	reflect.TypeOf((*models.UserActivate)(nil)).Elem(),
	reflect.TypeOf((*models.UserRecover)(nil)).Elem(),
	reflect.TypeOf((*models.UserRecoverAndChange)(nil)).Elem(),
	reflect.TypeOf((*models.UserForgotPassword)(nil)).Elem(),
	reflect.TypeOf((*models.GetContactPut)(nil)).Elem(),
	reflect.TypeOf((*models.GroupCreate)(nil)).Elem(),
	reflect.TypeOf((*models.GroupAddMembers)(nil)).Elem(),
	reflect.TypeOf((*models.GroupMemberRoleUpdate)(nil)).Elem(),
	reflect.TypeOf((*models.GroupSettingsUpdate)(nil)).Elem(),
	reflect.TypeOf((*models.GroupInfoUpdate)(nil)).Elem(),
	reflect.TypeOf((*models.GroupMessageSend)(nil)).Elem(),
	reflect.TypeOf((*models.GroupMessageEdit)(nil)).Elem(),
	reflect.TypeOf((*models.GroupMessageDelete)(nil)).Elem(),
	reflect.TypeOf((*models.GroupTyping)(nil)).Elem(),
	reflect.TypeOf((*models.CallOffer)(nil)).Elem(),
	reflect.TypeOf((*models.CallResponse)(nil)).Elem(),
	reflect.TypeOf((*models.CallEnd)(nil)).Elem(),
	reflect.TypeOf((*models.BaseMessage)(nil)).Elem(),
	reflect.TypeOf((*models.StatusCreate)(nil)).Elem(),
	reflect.TypeOf((*models.BugReport)(nil)).Elem(),
	reflect.TypeOf((*models.GitHubIssue)(nil)).Elem(),
	reflect.TypeOf((*models.ContactChat)(nil)).Elem(),
}

// finding is one JSON key discovered on a struct field.
type finding struct {
	pos   token.Position
	owner string
	field string
}

func (f finding) loc() string {
	if f.pos.Filename == "" {
		return fmt.Sprintf("%s.%s (source position unknown)", f.owner, f.field)
	}
	return fmt.Sprintf("%s:%d (%s.%s)", f.pos.Filename, f.pos.Line, f.owner, f.field)
}

// TestInventory is the AC0 guard: every non-camel JSON key must be explicitly
// allowlisted, and no allowlisted key may linger once it becomes camel/removed.
func TestInventory(t *testing.T) {
	positions := loadFieldPositions(t)

	hits := map[string][]finding{}
	for _, typ := range registry {
		seen := map[reflect.Type]bool{}
		walkFields(typ, seen, func(owner reflect.Type, f reflect.StructField) {
			key, ok := jsonKey(f)
			if !ok {
				return
			}
			hits[key] = append(hits[key], finding{
				pos:   positions[fieldPosKey(owner.PkgPath(), owner.Name(), f.Name)],
				owner: owner.PkgPath() + "." + owner.Name(),
				field: f.Name,
			})
		})
	}

	var missing, stale []string
	for key, fs := range hits {
		if isCamelKey(key) {
			continue
		}
		if _, ok := allowlist[key]; !ok {
			sortFindings(fs)
			missing = append(missing, key)
			t.Errorf("non-camelCase JSON key %q at %s: rename to camelCase or add it to the allowlist",
				key, fs[0].loc())
		}
	}
	for key := range allowlist {
		if isCamelKey(key) {
			stale = append(stale, key)
			continue
		}
		if _, found := hits[key]; !found {
			stale = append(stale, key)
		}
	}
	sort.Strings(stale)
	for _, key := range stale {
		t.Errorf("allowlist entry %q is stale: the key is camelCase now or no longer emitted; remove it from the allowlist", key)
	}

	t.Logf("inventory: %d registered structs, %d distinct JSON keys, %d non-camel allowlisted, %d missing, %d stale",
		len(registry), len(hits), len(allowlist), len(missing), len(stale))
}

// TestIsCamelKey pins the casing definition used by the inventory: lowerCamel,
// ID uppercase after the first word (messageID, statusID), a lone id lowercase,
// Url (not URL), and snake_case rejected.
func TestIsCamelKey(t *testing.T) {
	cases := []struct {
		key  string
		want bool
	}{
		// accepted
		{"id", true},
		{"messageID", true},
		{"groupID", true},
		{"replyToMessageID", true},
		{"upToMessageID", true},
		{"statusID", true},
		{"mediaUrl", true},
		{"avatarUrl", true},
		{"hasMore", true},
		{"lastSeen", true},
		{"contactName", true},
		{"wallpaperUrl", true},
		{"p256dh", true},
		{"sha256", true},
		{"os", true},
		{"to", true},
		{"from", true},
		// rejected: wrong casing / acronyms / snake / empty
		{"", false},
		{"ID", false},
		{"Username", false},
		{"Telephon", false},
		{"Gmail", false},
		{"MessageID", false},
		{"SenderTelephon", false},
		{"avatar_url", false},
		{"last_seen", false},
		{"contact_name", false},
		{"statusId", false},
		{"messageId", false},
		{"mediaURL", false},
		{"media_url", false},
		{"2fa", false},
	}
	for _, tc := range cases {
		if got := isCamelKey(tc.key); got != tc.want {
			t.Errorf("isCamelKey(%q) = %v, want %v", tc.key, got, tc.want)
		}
	}
}

// isCamelKey reports whether key follows the API contract:
// lowerCamelCase, first rune lowercase, letters/digits only, acronym ID kept
// uppercase after the first word (messageID, groupID, replyToMessageID), a lone
// id stays lowercase, Url (not URL), and snake_case rejected.
func isCamelKey(key string) bool {
	if key == "" {
		return false
	}
	for i := 0; i < len(key); i++ {
		c := key[i]
		ok := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
		if !ok {
			return false
		}
		if i == 0 && !(c >= 'a' && c <= 'z') {
			return false
		}
	}
	if strings.Contains(key, "Id") { // wrong acronym casing: statusId -> statusID
		return false
	}
	if strings.Contains(key, "URL") { // contract uses Url: mediaUrl, avatarUrl
		return false
	}
	return true
}

// jsonKey returns the effective JSON key for a field: the json tag name when
// present, otherwise the Go field name. A `json:"-"` field is not serialized.
func jsonKey(f reflect.StructField) (string, bool) {
	tag := f.Tag.Get("json")
	if tag == "-" {
		return "", false
	}
	name := strings.Split(tag, ",")[0]
	if name == "" {
		name = f.Name
	}
	return name, true
}

// walkFields visits every exported, non-anonymous field, recursing into
// anonymous embedded structs declared inside the backend packages (promoted
// fields). External embeds such as gorm.Model are skipped.
func walkFields(t reflect.Type, seen map[reflect.Type]bool, visit func(reflect.Type, reflect.StructField)) {
	if seen[t] {
		return
	}
	seen[t] = true
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		if !f.IsExported() {
			continue
		}
		if f.Anonymous {
			ft := f.Type
			if ft.Kind() == reflect.Ptr {
				ft = ft.Elem()
			}
			if ft.Kind() == reflect.Struct && strings.HasPrefix(ft.PkgPath(), "gorm/backend/") {
				walkFields(ft, seen, visit)
			}
			continue
		}
		visit(t, f)
	}
}

func sortFindings(fs []finding) {
	sort.Slice(fs, func(i, j int) bool {
		if fs[i].pos.Filename != fs[j].pos.Filename {
			return fs[i].pos.Filename < fs[j].pos.Filename
		}
		return fs[i].pos.Line < fs[j].pos.Line
	})
}

// loadFieldPositions parses the source of backend/schemas and backend/models so
// failures can point at file:line. Test files are skipped to avoid collisions.
func loadFieldPositions(t *testing.T) map[string]token.Position {
	t.Helper()
	root := repoRoot(t)
	out := map[string]token.Position{}
	for _, dir := range []string{"backend/schemas", "backend/models"} {
		paths, err := filepath.Glob(filepath.Join(root, dir, "*.go"))
		if err != nil {
			t.Fatalf("glob %s: %v", dir, err)
		}
		for _, path := range paths {
			if strings.HasSuffix(path, "_test.go") {
				continue
			}
			fset := token.NewFileSet()
			file, err := parser.ParseFile(fset, path, nil, 0)
			if err != nil {
				t.Fatalf("parse %s: %v", path, err)
			}
			ast.Inspect(file, func(n ast.Node) bool {
				ts, ok := n.(*ast.TypeSpec)
				if !ok {
					return true
				}
				st, ok := ts.Type.(*ast.StructType)
				if !ok {
					return true
				}
				for _, field := range st.Fields.List {
					for _, name := range field.Names {
						out[dir+"|"+ts.Name.Name+"."+name.Name] = fset.Position(name.Pos())
					}
				}
				return true
			})
		}
	}
	return out
}

// fieldPosKey disambiguates structs with the same name in different packages
// (for example schemas.Message vs models.Message).
func fieldPosKey(pkgPath, typeName, fieldName string) string {
	return strings.TrimPrefix(pkgPath, "gorm/") + "|" + typeName + "." + fieldName
}

// repoRoot derives the module root from this test file's location.
func repoRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Dir(filepath.Dir(filepath.Dir(file)))
}
