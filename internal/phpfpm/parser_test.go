package phpfpm

import "testing"

func TestNormalize(t *testing.T) {
	s := NormalizeStack("mysqli_query()\n[0xabc] MetaColumns( /x.php:4 )\n getTableColumns()")
	if s != "mysqli_query>metacolumns>gettablecolumns" {
		t.Fatal(s)
	}
}
