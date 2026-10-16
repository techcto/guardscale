<?php
trigger_error('Local fixture diagnostic warning', E_USER_WARNING);
http_response_code(200);
echo '<h1>Diagnostic complete</h1><a href="/">Home</a>';
