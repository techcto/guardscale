package profiles

import "strings"

type Profile struct {
	Name                                                                   string
	AdminPaths, ExpensivePaths, SensitiveParameters, HealthPaths, Services []string
}

func Generic() Profile {
	return Profile{Name: "generic-apache-php", AdminPaths: []string{"/admin"}, HealthPaths: []string{"/healthcheck"}, Services: []string{"httpd", "apache2", "php-fpm"}}
}
func WordPress() Profile {
	return Profile{Name: "wordpress-php", AdminPaths: []string{"/wp-admin/", "/wp-login.php"}, ExpensivePaths: []string{"/xmlrpc.php", "/wp-cron.php"}, SensitiveParameters: []string{"password", "token"}, HealthPaths: []string{"/healthcheck"}, Services: []string{"httpd", "apache2", "php-fpm"}}
}
func Drupal() Profile {
	return Profile{Name: "drupal-php", AdminPaths: []string{"/admin/", "/user/login"}, SensitiveParameters: []string{"pass", "token"}, HealthPaths: []string{"/healthcheck"}, Services: []string{"httpd", "apache2", "php-fpm"}}
}
func Detect(markers []string) Profile {
	for _, m := range markers {
		x := strings.ToLower(m)
		if strings.Contains(x, "wp-config.php") {
			return WordPress()
		}
		if strings.Contains(x, "sites/default/settings.php") {
			return Drupal()
		}
	}
	return Generic()
}
