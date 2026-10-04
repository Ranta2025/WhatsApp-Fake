package models

// ExpiredMessage es un mensaje temporal que el job de expiración acaba de
// borrar físicamente. Lleva los participantes para notificar a los clientes:
// 1:1 (SenderID/ReceptorID y sus teléfonos) o grupo (GroupID).
type ExpiredMessage struct {
	ID               uint
	SenderID         uint
	ReceptorID       uint
	SenderTelephon   string
	ReceptorTelephon string
	GroupID          uint
}
