package schemas

// ReactionSummary es el agregado de una reacción (un emoji) de un mensaje tal
// como lo ve el espectador: Count usuarios reaccionaron con Emoji y Mine indica
// si el espectador es uno de ellos. Viaja dentro de Message / GroupMessageResponse.
type ReactionSummary struct {
	Emoji string `json:"Emoji"`
	Count int    `json:"Count"`
	Mine  bool   `json:"Mine"`
}

// ReactionEvent es el payload del evento WS `reaction` (servidor -> cliente).
// Emoji vacío significa "reacción quitada". AuthorTelephon y Preview permiten al
// autor del mensaje mostrar la notificación aunque ese mensaje no esté cargado.
type ReactionEvent struct {
	Kind           string `json:"kind"`
	MessageID      uint   `json:"messageID"`
	GroupID        uint   `json:"groupID,omitempty"`
	Telephon       string `json:"telephon"`
	Username       string `json:"username"`
	Emoji          string `json:"emoji"`
	AuthorTelephon string `json:"authorTelephon"`
	Preview        string `json:"preview"`
}

// ReactionUserResponse es un usuario que reaccionó (GET .../reactions).
type ReactionUserResponse struct {
	Telephon  string `json:"telephon"`
	Username  string `json:"username"`
	AvatarUrl string `json:"avatarUrl"`
}

// ReactionUsersResponse agrupa los usuarios que reaccionaron con un emoji.
type ReactionUsersResponse struct {
	Emoji string                 `json:"emoji"`
	Users []ReactionUserResponse `json:"users"`
}

// ReactionsResponse es el cuerpo de GET .../reactions.
type ReactionsResponse struct {
	Reactions []ReactionUsersResponse `json:"reactions"`
}

// ReactionBody es el cuerpo de PUT .../reaction.
type ReactionBody struct {
	Emoji string `json:"emoji"`
}
