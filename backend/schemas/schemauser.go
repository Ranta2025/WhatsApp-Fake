package schemas

type UserGet struct {
	Username     string `gorm:"column:username" json:"username"`
	Telephon     string `gorm:"column:telephon" json:"telephon"`
	Gmail        string `gorm:"column:gmail" json:"email"`
	AvatarUrl    string `gorm:"column:avatar_url" json:"avatarUrl"`
	WallpaperUrl string `gorm:"column:wallpaper_url" json:"wallpaperUrl"`
}
