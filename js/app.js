_ = require('underscore');
$ = require('jquery');
jQuery = $;
resolveServer = require("./resolveServer.js").ResolveServer;

$(document).ready(function() {

    $('#login_form').submit(function() {
        var username = $('#login_username').val();
        var password = PASS = $('#login_password').val();
        login(username, password);
        return false;
    });

    var username = localStorage ? localStorage.getItem('username') : null;
    if (username) {
        $('#login_username').val(username);
        //$('#login_server').val(localStorage.getItem('server'));
    }

});


function RestHelper(login, password) {

    var parseLoginDeferred = resolveServer.parseLogin(login);
    var password = password;

    this.restAjaxRequest = function(relUrl, data, success, error, method) {
        parseLoginDeferred.done(function(relUrl, data, success, error, method) {
                return function (parsedLogin) {

                    var authHeader = "Basic " + btoa(parsedLogin.rest_user + ":" + password);
                    var url = "https://" + parsedLogin.rest_server + "/" + relUrl;

                    $.ajax
                    ({
                        type: method || "GET",
                        headers: {
                            "Accept": "application/vnd.iperity.compass.v1+json",
                            "Authorization": authHeader,
                            "X-No-Redirect": true
                        },
                        url: url,
                        dataType: 'json',
                        data: JSON.stringify(data),
                        success: success,
                        error: error
                    });
                }
        }(relUrl, data, success, error, method));
    }
}

var restHelper;
function login(username, password) {

    _.delay(function() { // De-couple from button event-handler for easier debugging.
        restHelper = new RestHelper(username, password);
        restHelper.restAjaxRequest("company", null,
            function(response) {console.log(response); alert("Login successful!");},
            function(response) {console.log(response); alert("Login failed");}
        );
    });
}