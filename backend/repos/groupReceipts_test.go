package repos

import (
	"gorm/backend/models"
	"testing"

	"github.com/stretchr/testify/assert"
)

func st(delivered, read uint) models.GroupReceiptState {
	return models.GroupReceiptState{DeliveredUpTo: delivered, ReadUpTo: read}
}

func TestMergeWatermarks(t *testing.T) {
	cases := []struct {
		name        string
		cur         models.GroupReceiptState
		delivered   uint
		read        uint
		max         uint
		want        models.GroupReceiptState
		wantChanged bool
	}{
		{"avanza delivered", st(5, 2), 8, 0, 20, st(8, 2), true},
		{"nunca retrocede", st(5, 2), 3, 1, 20, st(5, 2), false},
		{"se acota al maximo del grupo", st(5, 2), 99, 99, 20, st(20, 20), true},
		{"read arrastra delivered", st(5, 2), 0, 9, 20, st(9, 9), true},
		{"grupo vacio no avanza", st(0, 0), 5, 5, 0, st(0, 0), false},
		{"iguales no cambian", st(5, 5), 5, 5, 20, st(5, 5), false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, changed := mergeWatermarks(c.cur, c.delivered, c.read, c.max)
			assert.Equal(t, c.want, got)
			assert.Equal(t, c.wantChanged, changed)
		})
	}
}
