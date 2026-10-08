package models

type BugReport struct {
	Title       string `json:"title" binding:"required"`
	Description string `json:"description" binding:"required"`
	Steps       string `json:"steps"`
	Expected    string `json:"expected"`
	Actual      string `json:"actual"`
	UserEmail   string `json:"userEmail"`
	Browser     string `json:"browser"`
	OS          string `json:"os"`
	ScreenSize  string `json:"screenSize"`
}

type GitHubIssue struct {
	Title  string   `json:"title"`
	Body   string   `json:"body"`
	Labels []string `json:"labels"`
}
