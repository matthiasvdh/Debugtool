_ = require('underscore');
$ = require('jquery');
moment = require('moment');
datepicker = require('eonasdan-bootstrap-datetimepicker');
Papa = require("papaparse");

jQuery = $;
resolveServer = require("./resolveServer.js").ResolveServer;
var parseLoginDeferred = null;
var loggedIn = false;
var authHeader = null;

$(document).ready(function() {

    // Initialize date-pickers, on the beginning of the day and the current time respectively.
    var today = moment({hour: 0, minute: 0, seconds: 0, milliseconds: 0});
    var now = moment();
    $('#fromdatetimepicker').datetimepicker({defaultDate: today});
    $('#todatetimepicker').datetimepicker({defaultDate: now});

    $('#login_form').submit(function() {
        var username = $('#login_username').val();
        var password = PASS = $('#login_password').val();

        _.delay(function() { // De-couple from button event-handler for easier debugging.
            login(username, password);
        },0);
        return false;
    });

    var username = localStorage ? localStorage.getItem('username') : null;
    if (username) {
        $('#login_username').val(username);
        //$('#login_server').val(localStorage.getItem('server'));
    }

});


function RestHelper(login, password) {

    parseLoginDeferred = resolveServer.parseLogin(login);
    var password = password;

    this.restAjaxRequest = function(relUrl, data, success, error, method) {
        parseLoginDeferred.done(function(relUrl, data, success, error, method) {
                return function (parsedLogin) {

                    authHeader = "Basic " + btoa(parsedLogin.rest_user + ":" + password);
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
var companyId = 0;
function login(username, password) {

    restHelper = new RestHelper(username, password);
    restHelper.restAjaxRequest("company", null,
        companyReceived,
        function(response) {console.log(response); errorMessage("Login failed");}
    );
}

function companyReceived(response) {
    loggedIn = true;
    //console.log(response);

    companyId = (response) ? response.entityId : 0;
    if (companyId == 0) {
        errorMessage("Could not discover company-id.");
        return;
    }

    var fromDate = $('#fromdatetimepicker').data("DateTimePicker").date();
    var fromTimestamp = fromDate.unix();

    var toDate = $('#todatetimepicker').data("DateTimePicker").date();
    var toTimestamp = toDate.unix();

    // Call-events
    var userEventDownloadUrl = getEventDownloadUrl(companyId, fromTimestamp, toTimestamp, "calls");
    downloadFromUrl(userEventDownloadUrl, "calls");

    // User-events
    var userEventDownloadUrl = getEventDownloadUrl(companyId, fromTimestamp, toTimestamp, "users");
    downloadFromUrl(userEventDownloadUrl, "users");

    //console.log(userEventDownloadUrl);
}

/**
 *
 * @param companyId
 * @param startTime
 * @param endTime
 * @param eventType - Should be 'calls' or 'users'
 * @returns {string}
 */
function getEventDownloadUrl(companyId, startTime, endTime, eventType) {
    //￼https://files.pbx.speakup-telecom.com/events/$COMPANY_ID/calls?startTime=$TIME1&endTime=$TIME2
    return "https://files.pbx.speakup-telecom.com/events/" + companyId + "/"+ eventType + "?startTime=" + startTime + "&endTime=" + endTime;
}

function downloadFromUrl(url, type) {
    if (!authHeader) {
        errorMessage("Not logged in yet.")
        return;
    }

    // We use a proxy, because the event-log doesn't have CORS headers.
    var proxyUrl = "https://bedienpost.nl/proxy.php?url=" + url + "&mode=native";

    var xhr = new XMLHttpRequest();
    xhr.eventType = type;
    xhr.open("GET", proxyUrl, true);
    xhr.setRequestHeader("Authorization", authHeader);
    xhr.onreadystatechange = downloadDone
    xhr.send()

}

function downloadDone(response) {

    var type = response.target.eventType;
    if (response.target.readyState != 4) {
        return;
    }
    if (response.target.status != 200) {
        errorMessage("Failed to download " + type + " from server.");
        console.log(response);
    }

    var responseText = response.target.responseText;


    // Parse the CSV
    var papaObj = Papa.parse(responseText, {
        header: true,
        dynamicTyping: true
    });
    var parsed = papaObj.data;

    // Re-format the time
    for (var key in parsed) {
        var row = parsed[key];

        if (row.timestamp) {
            var timeObj = moment.unix(row.timestamp);
            //console.log(timeObj);
            row.formattedTime = timeObj.format("Do MMMM YYYY, H:mm:ss");
        }
    }

    // Order by call-id first and timestamp second.
    //parsed = _.sortBy(parsed, "timestamp");
    parsed = _.sortBy(parsed, "call_id");
    //console.log(parsed);

    // unparse csv
    var newCsv = Papa.unparse(parsed, {
        quotes: {"call_id" : true}
    });
    //console.log(newCsv);

     blob = new Blob([newCsv], {
        type: 'text/csv'
     })

     var url = URL.createObjectURL(blob)
     document.getElementById('download'+type).href = url;

    console.log("Done processing, enabling download link: " + 'download'+type);
}


function errorMessage(msg) {
    console.log(msg);
    alert(msg);
}