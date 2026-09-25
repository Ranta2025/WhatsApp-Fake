package app

import (
	"errors"
	"gorm/backend/models"
	"gorm/backend/utils"
	"log"
	"os"
	"time"

	"gorm.io/gorm"
)

// DemoPassword es la contraseña de los usuarios de demostración.
const DemoPassword = "Demo1234!"

type demoUser struct {
	username, email, telephon string
}

var demoUsers = []demoUser{
	{"ana_demo", "ana@todos.local", "+34600000001"},
	{"luis_demo", "luis@todos.local", "+34600000002"},
	{"marta_demo", "marta@todos.local", "+34600000003"},
}

// seedDemoData crea (solo si SEED_DEMO_DATA=true) usuarios activos de prueba,
// contactos entre ellos, una conversación y un grupo, para poder probar la app
// en local sin registrarse. Es idempotente: no duplica nada si ya existe.
func seedDemoData(db *gorm.DB) {
	if os.Getenv("SEED_DEMO_DATA") != "true" {
		return
	}
	if err := db.Transaction(seedDemo); err != nil {
		log.Printf("[SEED] Error creando datos de demostración: %v", err)
		return
	}
	log.Printf("[SEED] Usuarios de demostración listos: ana_demo, luis_demo, marta_demo (contraseña %s)", DemoPassword)
}

func seedDemo(tx *gorm.DB) error {
	var existing int64
	if err := tx.Model(&models.UserDataBase{}).Where("username = ?", demoUsers[0].username).Count(&existing).Error; err != nil {
		return err
	}
	if existing > 0 {
		return nil // ya sembrado
	}

	hash, err := utils.Hash(DemoPassword)
	if err != nil {
		return err
	}

	users := make([]models.UserDataBase, len(demoUsers))
	for i, u := range demoUsers {
		users[i] = models.UserDataBase{
			User:     models.User{Username: u.username, Gmail: u.email, Telephon: u.telephon},
			Password: hash,
			Activo:   true,
		}
		if err := tx.Create(&users[i]).Error; err != nil {
			if errors.Is(err, gorm.ErrDuplicatedKey) {
				return nil
			}
			return err
		}
	}

	// Todos son contactos de todos
	names := map[uint]string{users[0].ID: "Ana", users[1].ID: "Luis", users[2].ID: "Marta"}
	for _, a := range users {
		for _, b := range users {
			if a.ID == b.ID {
				continue
			}
			contact := models.ContactDataBase{IdUser: a.ID, IdContact: b.ID, Status: "accepted", ContactName: names[b.ID]}
			if err := tx.Create(&contact).Error; err != nil {
				return err
			}
		}
	}

	// Conversación de ejemplo entre Ana y Luis
	now := time.Now()
	conversation := []struct {
		from, to int
		text     string
	}{
		{1, 0, "¡Hola Ana! 👋 Bienvenida a todos"},
		{0, 1, "¡Hola Luis! Qué bien se ve la app 😄"},
		{1, 0, "Prueba a enviarme una nota de voz o una foto"},
	}
	for i, m := range conversation {
		msg := models.Message{
			IdUser:     users[m.from].ID,
			IdReceptor: users[m.to].ID,
			Message:    m.text,
			Status:     "visto",
			Time:       now.Add(time.Duration(i-len(conversation)) * time.Minute),
		}
		if err := tx.Create(&msg).Error; err != nil {
			return err
		}
	}

	// Grupo de ejemplo
	group := models.Group{Name: "Equipo demo", Description: "Grupo de prueba", CreatorID: users[0].ID}
	if err := tx.Create(&group).Error; err != nil {
		return err
	}
	for i, u := range users {
		role := "member"
		if i == 0 {
			role = "admin"
		}
		member := models.GroupMember{GroupID: group.ID, UserID: u.ID, Role: role, AddedByID: users[0].ID}
		if err := tx.Create(&member).Error; err != nil {
			return err
		}
	}
	welcome := models.GroupMessage{GroupID: group.ID, SenderID: users[2].ID, Message: "¡Hola equipo! 🎉", Time: now.Add(-30 * time.Second)}
	return tx.Create(&welcome).Error
}
