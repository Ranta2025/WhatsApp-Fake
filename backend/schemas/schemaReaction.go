package schemas

// ReactionSummary es el agregado de una reacción (un emoji) de un mensaje tal
// como lo ve el espectador: Count usuarios reaccionaron con Emoji y Mine indica
// si el espectador es uno de ellos. Viaja dentro de Message / GroupMessageResponse.
type ReactionSummary struct {
	Emoji string `json:"Emoji"`
	Count int    `json:"Count"`
	Mine  bool   `json:"Mine"`
}
