package models

import (
	"time"

	"gorm.io/gorm"
)

type Status struct {
	gorm.Model
	OwnerID    uint      `gorm:"not null;index"`
	Text       string    `gorm:"size:700" json:"text,omitempty"`
	MediaUrl   string    `gorm:"size:500" json:"mediaUrl,omitempty"`
	MediaType  string    `gorm:"size:20" json:"mediaType,omitempty"`
	Background string    `gorm:"size:50" json:"background,omitempty"`
	ExpiresAt  time.Time `gorm:"not null;index" json:"expiresAt"`

	Owner UserDataBase `gorm:"foreignKey:OwnerID;references:ID"`
}

type StatusView struct {
	gorm.Model
	StatusID  uint         `gorm:"not null;index"`
	ViewerID  uint         `gorm:"not null;index"`
	ViewedAt  time.Time    `gorm:"not null"`
	StatusRef Status       `gorm:"foreignKey:StatusID;references:ID"`
	Viewer    UserDataBase `gorm:"foreignKey:ViewerID;references:ID"`
}

type StatusItem struct {
	ID         uint           `json:"id"`
	Text       string         `json:"text,omitempty"`
	MediaUrl   string         `json:"mediaUrl,omitempty"`
	MediaType  string         `json:"mediaType,omitempty"`
	Background string         `json:"background,omitempty"`
	CreatedAt  time.Time      `json:"createdAt"`
	ExpiresAt  time.Time      `json:"expiresAt"`
	ViewCount  int64          `json:"viewCount"`
	Viewed     bool           `json:"viewed"`
	Viewers    []StatusViewer `json:"viewers,omitempty"`
}

type StatusViewer struct {
	ViewerTelephon string    `json:"viewerTelephon"`
	ViewerUsername string    `json:"viewerUsername"`
	ViewerName     string    `json:"viewerName"`
	ViewerAvatar   string    `json:"viewerAvatar"`
	ViewedAt       time.Time `json:"viewedAt"`
}

type StatusThread struct {
	OwnerTelephon string       `json:"ownerTelephon"`
	OwnerUsername string       `json:"ownerUsername"`
	OwnerName     string       `json:"ownerName"`
	OwnerAvatar   string       `json:"ownerAvatar"`
	LastStatusAt  time.Time    `json:"lastStatusAt"`
	HasUnviewed   bool         `json:"hasUnviewed"`
	Statuses      []StatusItem `json:"statuses"`
}

type StatusFeedResponse struct {
	MyStatuses *StatusThread  `json:"myStatuses"`
	Contacts   []StatusThread `json:"contacts"`
}

type StatusFeedRow struct {
	StatusID      uint
	OwnerID       uint
	OwnerTelephon string
	OwnerUsername string
	OwnerAvatar   string
	ContactName   string
	Text          string
	MediaUrl      string
	MediaType     string
	Background    string
	CreatedAt     time.Time
	ExpiresAt     time.Time
	ViewCount     int64
	Viewed        bool
}

type StatusViewerRow struct {
	StatusID       uint
	OwnerTelephon  string
	ViewerTelephon string
	ViewerUsername string
	ViewerAvatar   string
	ViewerName     string
	ViewedAt       time.Time
}

type StatusViewedEvent struct {
	OwnerTelephon string       `json:"ownerTelephon"`
	StatusID      uint         `json:"statusID"`
	ViewCount     int64        `json:"viewCount"`
	Viewer        StatusViewer `json:"viewer"`
}
