_ = require('underscore');
$ = require('jquery');
moment = require('moment');
datepicker = require('eonasdan-bootstrap-datetimepicker');
Papa = require("papaparse");

jQuery = $;
resolveServer = require("./resolveServer.js").ResolveServer;

var dateFormat = "D/MM/YY H:mm:ss";

var parseLoginDeferred = null;
var parsedLogin = null;
var loggedIn = false;
var authHeader = null;


$(document).ready(function() {

    // Initialize date-pickers, on the beginning of the day and the current time respectively.
    var today = moment({hour: 0, minute: 0, seconds: 0, milliseconds: 0});
    var now = moment();
    $('#fromdatetimepicker').datetimepicker({
        defaultDate: today,
        format: dateFormat
    });
    $('#todatetimepicker').datetimepicker({
        defaultDate: now,
        format: dateFormat
    });

    $('#login_form').submit(function() {
        var username = $('#login_username').val();
        var password = PASS = $('#login_password').val();

        _.delay(function() { // De-couple from button event-handler for easier debugging.
            login(username, password);
        },0);
        return false;
    });

    $('#download_button').click(function() {
        _.delay(doDownload, 0);
    });

    $('#goback_button').click(function() {
        location.reload();
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
                return function (parsedLoginArg) {
                    parsedLogin = parsedLoginArg;

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
        function(response) {
            if (response.status != 404) {
                console.log(response);
                errorMessage("Login failed");
            } else {
                // Reseller-users give a 404, since they're not associated with a single company. Continue in this case.
                companyReceived(null);
            }
        }
    );
}

function companyReceived(response) {
    loggedIn = true;
    // Hide login-screen, show date-pickers.
    $('#login').hide();
    $('#datepickers').show();
    //console.log(response);

    companyId = (response) ? response.entityId : 0;
    if (companyId != 0) {
        $('#company_id_field').val(companyId);
    }
}

function doDownload() {
    var fromDate = $('#fromdatetimepicker').data("DateTimePicker").date();
    var fromTimestamp = fromDate.unix();

    var toDate = $('#todatetimepicker').data("DateTimePicker").date();
    var toTimestamp = toDate.unix();

    // Get company-id from input field.
    companyId = parseInt($('#company_id_field').val(), 10);
    if (isNaN(companyId)) {
        errorMessage("Enter a valid number in the Company-id field.");
        return;
    }

    // Call-events
    var userEventDownloadUrl = getEventDownloadUrl(companyId, fromTimestamp, toTimestamp, "calls");
    downloadFromUrl(userEventDownloadUrl, "calls");

    // User-events
    var userEventDownloadUrl = getEventDownloadUrl(companyId, fromTimestamp, toTimestamp, "users");
    downloadFromUrl(userEventDownloadUrl, "users");
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
    return "https://files." + parsedLogin.base_domain + "/events/" + companyId + "/"+ eventType + "?startTime=" + startTime + "&endTime=" + endTime;
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
        errorMessage("Failed to download " + type + " from server. Do you have read-rights on this company?");
        console.log(response);
        return;
    }

    $('#datepickers').hide();

    var responseText = response.target.responseText;

    var startTime = Date.now();

    // Parse the CSV
    var papaObj = Papa.parse(responseText, {
        header: true,
        dynamicTyping: true
    });
    var parsed = papaObj.data;
    var size = _.size(parsed);

    // Re-format the time
    for (var key in parsed) {
        var row = parsed[key];

        if (row.timestamp) {
            var timeObj = moment.unix(row.timestamp);
            row.formattedTime = timeObj.format(dateFormat);
        }
    }

    // Order by timestamp, but group by call_id.
    var grouped = _.groupBy(parsed, "call_id");
    //console.log(grouped);

    var parsed = [];
    for (var key in grouped) {
        Array.prototype.push.apply(parsed, grouped[key]);
    }

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
    $('#downloadlinks').show();
    $('#download'+type).show();

    var endTime = Date.now();
    console.log("Processing of " + size + " elements took: " + (endTime - startTime) + "ms");
}


function errorMessage(msg) {
    console.log(msg);
    alert(msg);
}
