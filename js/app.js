_ = require('underscore');
$ = require('jquery');
moment = require('moment');
datepicker = require('eonasdan-bootstrap-datetimepicker');
Papa = require("papaparse");
ko = require("knockout");
async = require("async");

jQuery = $;
resolveServer = require("./resolveServer.js").ResolveServer;

var dateFormat = "D/MM/YY H:mm:ss";

var parseLoginDeferred = null;
var parsedLogin = null;
var loggedIn = false;
var companyNameToId = {};
var authHeader = null;
var appViewModel = null;

function AppViewModel() {
    this.companyOptions = ko.observable(["unknown"]);
    this.selectedCompanyOption = ko.observable("unknown");

    this.selectedCompanyId = ko.computed(function() {
        return companyNameToId[this.selectedCompanyOption()];
    }, this);
}

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

    // Activates knockout.js
    appViewModel = new AppViewModel();
    ko.applyBindings(appViewModel);
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
                            "Accept": "application/vnd.iperity.compass.v2+json",
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

    restHelper = new RestHelper(username, password);
    restHelper.restAjaxRequest("company", null,
        companyReceived,
        function(response) {
            if (response.status != 404) {
                console.log(response);
                errorMessage("Login failed");
            } else {
                // Reseller-users give a 404, since they're not associated with a single company. Retrieve valid companies for reseller in this case.
                retrieveResellerCompanies();
            }
        }
    );
}

/*
 * - get /user
 * - /user/id/reseller
 * - /entity/id/entitiesFiltered?filter=company
 */

function companyReceived(company) {
    addCompany(company);
    appViewModel.companyOptions([company.name]);
    appViewModel.selectedCompanyOption = company.name;
    userLoggedIn();
}

function userLoggedIn() {
    loggedIn = true;
    // Hide login-screen, show date-pickers.
    $('#login').hide();
    $('#datepickers').show();
    //console.log(response);
}

function addCompany(company) {
    var companyId = company.entityId ;
    var companyName = company.name;
    if (!(companyId && companyName)) {
        console.warn("company " + JSON.stringify(company) + " not added to model because of missing values.");
    }
    console.log("Adding company " + companyName + " with id: " + companyId);
    companyNameToId[companyName] = companyId;

    appViewModel.companyOptions().push(companyName);
}

function checkExistsInResponse(response, key, cb) {
    if (!response[key]) {
        cb(new Error("Response " + JSON.stringify(response) + " does not have key " + key));
        return false;
    }
    return true;
}

function retrieveResellerCompanies() {
    async.waterfall([

        // Retrieve the current user
        function(cb) {

            restHelper.restAjaxRequest("user", null, function(response){
                cb(null, response);         // success
            }, function(response){
                cb(new Error(response));    // error
            });
        },

        // Retrieve the reseller for the user.
        function(response, cb) {
            checkExistsInResponse(response, "entityId", cb);
            var user = response;

            restHelper.restAjaxRequest("user/" + user.entityId + "/reseller", null, function(response){
                cb(null, response);         // success
            }, function(response){
                cb(new Error(response));    // error
            });
        },

        // Retrieve the Companies under the reseller.
        function(response, cb) {
            checkExistsInResponse(response, "entityId", cb);
            var reseller = response;

            restHelper.restAjaxRequest("entity/" + reseller.entityId + "/entitiesFiltered?filter=company", null, function(response){
                cb(null, response);         // success
            }, function(response){
                cb(new Error(response));    // error
            });
        },

       // Add all companies to the list.
    ], function(err, result) {
        if (err) {
            console.log("Error occurred:" + err);
            errorMessage("An error occured while retrieving companies: \n" + err);
            return;
        }

        var companies = result;
        // Allright, we should have the companies!
        appViewModel.companyOptions([]); // Empty drop-down. New companies will be added through addCompany.
        for (var companyKey in companies) {
            var company = companies[companyKey];
            addCompany(company);
        }
        appViewModel.companyOptions(appViewModel.companyOptions());
        userLoggedIn();
    });
}

function doDownload() {
    var fromDate = $('#fromdatetimepicker').data("DateTimePicker").date();
    var fromTimestamp = fromDate.unix();

    var toDate = $('#todatetimepicker').data("DateTimePicker").date();
    var toTimestamp = toDate.unix();

    // Get company-id from input field.
    var companyId = appViewModel.selectedCompanyId();
    if (isNaN(companyId)) {
        errorMessage("Enter a valid number in the Company-id field.");
        return;
    }

    // Call-events
    //var userEventDownloadUrl = getEventDownloadUrl(companyId, fromTimestamp, toTimestamp, "calls");
    //downloadFromUrl(userEventDownloadUrl, "calls");

    // User-events
    //var userEventDownloadUrl = getEventDownloadUrl(companyId, fromTimestamp, toTimestamp, "users");
    //downloadFromUrl(userEventDownloadUrl, "user");

    var cdrDownloadUrl = getCdrDownloadUrl(companyId, fromTimestamp, "user");
    downloadFromUrl(cdrDownloadUrl, "user");

    cdrDownloadUrl = getCdrDownloadUrl(companyId, fromTimestamp, "user");
    downloadFromUrl(cdrDownloadUrl, "queue");

    cdrDownloadUrl = getCdrDownloadUrl(companyId, fromTimestamp, "user");
    downloadFromUrl(cdrDownloadUrl, "company");
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

function getCdrDownloadUrl(companyId, date, eventType) {
    date = "2016-02-02";
    return "https://files." + parsedLogin.base_domain + "/cdr/" + companyId + "/" + date + "/" + eventType + ".csv";
}

function downloadFromUrl(url, type) {
    if (!authHeader) {
        errorMessage("Not logged in yet.")
        return;
    }

    var xhr = new XMLHttpRequest();
    xhr.eventType = type;
    xhr.open("GET", url, true);
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
    /*for (var key in parsed) {
        var row = parsed[key];

        if (row.timestamp) {
            var timeObj = moment.unix(row.timestamp);
            row.formattedTime = timeObj.format(dateFormat);
        }
    }*/

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

     var url = URL.createObjectURL(blob);
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
