_ = require('underscore');
$ = require('jquery');
moment = require('moment');
datepicker = require('eonasdan-bootstrap-datetimepicker');
Papa = require("papaparse");
ko = require("knockout");
async = require("async");
jQuery = $;
resolveServer = require("./resolveServer.js").ResolveServer;

var dateFormat = "D/MM/YYYY";
var columnNames = {
    user: ['callid', 'parent_callid', 'start_time', 'answer_time', 'end_time', 'timezone', 'identity_id', 'identity_name', 'direction', 'number'],
    queue: ['callid', 'start_time', 'timezone', 'wait_duration', 'agent_duration', 'queue_id', 'queue_name', 'agent_id', 'agent_name', 'from_number'],
    company: ['callid', 'start_time', 'answer_time', 'end_time', 'timezone', 'from_type', 'from_id', 'from_number', 'from_number', 'from_name', 'to_number', 'end_reason'],
    calls: ['id', 'company_id', 'call_id', 'parent_id', 'step', 'timestamp', 'caller_type', 'caller_id', 'caller_number', 'caller_desc', 'callee_type', 'callee_number', 'callee_desc', 'state', 'end_reason']
}

var parseLoginDeferred = null;
var parsedLogin = null;
var loggedIn = false;
var companyNameToId = {};
var authHeader = null;
var appViewModel = null;
var prevData = null;
var prevType = null;
var eventData = null;

function AppViewModel() {
    this.companyOptions = ko.observable(["unknown"]);
    this.selectedCompanyOption = ko.observable("unknown");

    this.activeListView = ko.observable([]);
    this.activeColumnNames = ko.observable([]);
    this.selectedCallId = ko.observable(null);

    this.selectedCompanyId = ko.computed(function() {
        return companyNameToId[this.selectedCompanyOption()];
    }, this);

    var self = this;

    this.backClicked = function() {
        console.log("back clicked");
        if (prevData) {
            displayData(prevData, prevType);
        }
    }

    this.callClicked = function(item) {
        if (!item.callid) {
            console.log("Already zoomed in, not processing another click on calls.");
            return;
        }

        console.log("Call clicked: " + item.callid);
        self.selectedCallId(item.callid);

        var fromDate = $('#fromdatetimepicker').data("DateTimePicker").date();
        var fromTimestamp = fromDate.unix();
        var toTimestamp = fromTimestamp + 86400;

        var userEventDownloadUrl = getEventDownloadUrl(self.selectedCompanyId(), fromTimestamp, toTimestamp, "calls");
        //console.log(userEventDownloadUrl);

        if (eventData) {
            processData(eventData, "calls");
        } else {
            downloadFromUrl(userEventDownloadUrl, "calls");
        }
    }
}

$(document).ready(function() {

    // Initialize date-pickers, on the beginning of the day and the current time respectively.
    var today = moment({hour: 0, minute: 0, seconds: 0, milliseconds: 0});
    var now = moment();
    $('#fromdatetimepicker').datetimepicker({
        defaultDate: today,
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

    $('#download_button_user').click(function() {
        _.delay(doDownloadCdr, 0, "user");
    });
    $('#download_button_queue').click(function() {
        _.delay(doDownloadCdr, 0, "queue");
    });
    $('#download_button_company').click(function() {
        _.delay(doDownloadCdr, 0, "company");
    });

    $('#logout_button').click(function() {
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
    appViewModel.selectedCompanyOption(company.name);
    retrieveResellerCompanies();
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
    console.log("Retrieving reseller companies.");

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
            //errorMessage("An error occured while retrieving companies: \n" + err);
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

function doDownloadCdr(type) {
    var fromDate = $('#fromdatetimepicker').data("DateTimePicker").date();
    var fromTimestamp = fromDate.format("YYYY-MM-DD");

    // Get company-id from input field.
    var companyId = appViewModel.selectedCompanyId();
    console.log("Downloading CDRs for compay " + companyId + " and date " + fromTimestamp);
    if (isNaN(companyId)) {
        errorMessage("Enter a valid number in the Company-id field.");
        return;
    }

    switch(type) {
        case "user":
        case "queue":
        case "company":
            var cdrDownloadUrl = getCdrDownloadUrl(companyId, fromTimestamp, type);
            downloadFromUrl(cdrDownloadUrl, type);
            break;

        default:
            errorMessage("Asked to download an unknown type: " + type);
            return;
    }

    // Call-events
    //var userEventDownloadUrl = getEventDownloadUrl(companyId, fromTimestamp, toTimestamp, "calls");
    //downloadFromUrl(userEventDownloadUrl, "calls");

    // User-events
    //var userEventDownloadUrl = getEventDownloadUrl(companyId, fromTimestamp, toTimestamp, "users");
    //downloadFromUrl(userEventDownloadUrl, "user");

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
    return "https://files." + parsedLogin.base_domain + "/cdr/" + companyId + "/" + date + "/" + eventType + ".csv";
}

function downloadFromUrl(url, type) {
    if (!authHeader) {
        errorMessage("Not logged in yet.")
        return;
    }

    console.log("Downloading from url " + url);

    var xhr = new XMLHttpRequest();
    xhr.eventType = type;
    xhr.open("GET", url, true);
    xhr.setRequestHeader("Authorization", authHeader);
    xhr.onreadystatechange = downloadRetrieved
    xhr.send()

}

function downloadRetrieved(response) {
    // Support chunked encoding
    var type = response.target.eventType;
    if (response.target.readyState != 4) {
        return;
    }
    if (response.target.status != 200) {
        errorMessage("Failed to download " + type + " from server. Do you have read-rights on this company?");
        console.log(response);
        return;
    }

    console.log("Download done. Processing ...");
    var responseText = response.target.responseText;
    processData(responseText, type);
}

function processData(responseText, type) {
    var startTime = Date.now();

    // Parse the CSV
    var papaObj = Papa.parse(responseText, {
        header: true,
        dynamicTyping: true
    });
    var parsed = papaObj.data;
    // Remove the last, almost empty, element.
    var size = _.size(parsed);
    parsed.splice(size - 1, 1);

    // Re-format the time
    for (var key in parsed) {
        var row = parsed[key];

        if (row.timestamp) {
            var timeObj = moment.unix(row.timestamp);
            row.timestamp = timeObj.format("D/MM/YYYY H:mm:ss.SSS");
        }
    }

    // Order by timestamp, but group by call_id.
    var grouped = _.groupBy(parsed, "call_id");
    var parsed = [];
    for (var key in grouped) {
        Array.prototype.push.apply(parsed, grouped[key]);
    }

    if (appViewModel.selectedCallId()) {
        var callId = appViewModel.selectedCallId();
        parsed = _.where(parsed, {call_id: callId});
    }


    if (type == "calls") {
        eventData = responseText;
        parsed = _.sortBy(parsed, "step");
    }

    var endTime = Date.now();
    console.log("Parsing of " + size + " elements took: " + (endTime - startTime) + "ms");

    displayData(parsed, type);
}

function displayData(parsed, type) {
    $('#datepickers').hide();

    // unparse csv
    var startTime = Date.now();
    var size = _.size(parsed);
    var newCsv = Papa.unparse(parsed, {
        quotes: {"call_id" : true}
    });
    var endTime = Date.now();
    console.log("Creating csv for " + size + " elements took: " + (endTime - startTime) + "ms");

    // Setup download-link
    blob = new Blob([newCsv], {type: 'text/csv' })
    var url = URL.createObjectURL(blob);
    document.getElementById('download'+type).href = url;
    // unhide download-link
    console.log("Done processing, enabling download link: " + 'download'+type);
    $('#downloadlinks').show();
    $('#download'+type).show();

    // List-view
    $('#cdr_table').hide();
    appViewModel.activeListView([]);
    appViewModel.activeColumnNames(columnNames[type]);
    appViewModel.activeListView(parsed);
    $('#cdr_table').show();

    if (type == "calls") {
        $('#backbutton').show();
    } else {
        prevData = parsed;
        prevType = type;
        $('#backbutton').hide();
    }
}

function errorMessage(msg) {
    console.log("ERROR:" + msg);
    alert(msg);
}
