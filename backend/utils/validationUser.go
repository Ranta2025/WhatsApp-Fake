package utils

import (
	"strings"
	"unicode"
)

func ValidationLenUsername(username string) bool {
	return len(username) >= 5
}

func ValidationGmail(gmail string) bool {
	return strings.HasSuffix(gmail, "@gmail.com") && len(gmail) > 10
}

func ValidationPasswordLen(password string) bool {
	return len(password) > 7
}

func ValidationPasswordNumber(password string) bool {
	for _, i := range password {
		if unicode.IsNumber(i) {
			return true
		} 
	}
	return false
}


func ValidationPasswordUpper(password string) bool {
	for _,i := range password {
		if unicode.IsUpper(i) {
			return true
		}
	}
	return false
}

func ValidationPasswordCharacterSpecial(password string) bool {
	for _, v := range password {
		if !unicode.IsNumber(v) && !unicode.IsLetter(v) {
			return true
		}
	}
	return false
}