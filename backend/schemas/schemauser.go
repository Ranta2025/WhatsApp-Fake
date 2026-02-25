package schemas

type UserGet struct {
	Username  string `gorm:"column:username"`
	Telephon  string `gorm:"column:telephon"`
	Gmail     string `gorm:"column:gmail"`
	AvatarUrl string `gorm:"column:avatar_url" json:"avatar_url"`
}
