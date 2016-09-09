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
    userevents: ['id','timestamp','company_id','company_name','event_type','event_data','user_id','user_name','user_fullname','identity_id','identity_name','target_type','target_id','target_name'],
    calls: ['id', 'company_id', 'call_id', 'parent_id', 'step', 'timestamp', 'caller_type', 'caller_id', 'caller_number', 'caller_desc', 'callee_type', 'callee_number', 'callee_desc', 'state', 'end_reason']
}

var COMPANYCACHEKEY = "eventLogTool_companyCache";
var COMPANYCACHEREFRESHAGE = 100000;

var parseLoginDeferred = null;
var parsedLogin = null;
var loggedIn = false;
var companyNameToId = {};
var authHeader = null;
var appViewModel = null;
var prevData = null;
var prevType = null;
var eventData = null;
var userId = 0;

var loginInfoKey = "elt_loginInfo";
var defaultCompanyOption = "No Access To Any Company";
var loginInfo = {username: "", password: "", loggedIn: false, selectedCompanyOption: defaultCompanyOption};

function AppViewModel() {
    this.companyOptions = ko.observable([defaultCompanyOption]);
    this.selectedCompanyOption = ko.observable(defaultCompanyOption);

    this.activeListView = ko.observable([]);
    this.activeColumnNames = ko.observable([]);
    this.selectedCallId = ko.observable(null);

    this.selectedCompanyId = ko.computed(function() {
        //console.log ("---- computing selectedCompanyId, companyNameToId:")
        //console.log(companyNameToId);
        return companyNameToId[this.selectedCompanyOption()];
    }, this);

    var self = this;

    this.detailBackClicked = function() {
        console.log("Previous clicked in detail screen");
        $('#downloadcalls').hide();
        if (prevData) {
            displayData(prevData, prevType);
        }
    }

    this.backClicked = function() {
        console.log("back clicked");
        location.reload();
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

    var loginInfoStr = localStorage.getItem(loginInfoKey);
    try {
        if (loginInfoStr) loginInfo = JSON.parse(loginInfoStr);
    } catch (e) {
        console.log("Error occured trying to parse loginInfo: " + e);
        loginInfo.loggedIn = false;
    }
    if (loginInfo.loggedIn) {
        console.log("Was previously logged in. Automatically logging in as " + loginInfo.username);

        PASS = loginInfo.password;
        $('#login_username').val(loginInfo.username);
        $('#login_password').val(loginInfo.password);

        login(loginInfo.username, loginInfo.password);
    } else {
        showLoginScreen();
    }

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
    $('#download_button_userevents').click(function() {
        _.delay(doDownloadCdr, 0, "userevents");
    });

    $('#logout_button').click(function() {
        localStorage.clear();
        location.reload();
    });

    /*var username = localStorage ? localStorage.getItem('username') : null;
    if (username) {
        $('#login_username').val(username);
        //$('#login_server').val(localStorage.getItem('server'));
    }*/

    // Activates knockout.js
    appViewModel = new AppViewModel();
    ko.applyBindings(appViewModel);
});

function showLoginScreen() {
    $('#login').show();
}

function saveLoginInfo() {
    localStorage.setItem(loginInfoKey, JSON.stringify(loginInfo));
}

function RestHelper(login, password) {

    parseLoginDeferred = resolveServer.parseLogin(login);
    var password = password;
    parseLoginDeferred.done(function(parsedLoginArg) {
        parsedLogin = parsedLoginArg;
        authHeader = "Basic " + btoa(parsedLogin.rest_user + ":" + password);
    });

    this.restAjaxRequest = function(relUrl, data, success, error, method) {

        parseLoginDeferred.done(function(relUrl, data, success, error, method) {
                return function () {
                    var url = "";
                    if (relUrl.indexOf("http") == -1) {
                        url = "https://" + parsedLogin.rest_server + "/" + relUrl;
                    } else {
                        url = relUrl;
                    }

                    console.log("Request to " + url);
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
    console.log("Logging in as " + username);

    loginInfo.username = username;
    loginInfo.password = password;
    loginInfo.loggedIn = true;
    saveLoginInfo();

    restHelper = new RestHelper(username, password);
    _.delay(retrieveCompanies,0);
}


function userLoggedIn() {
    loggedIn = true;
    // Hide login-screen, show date-pickers.
    $('#login').hide();
    $('#datepickers').show();
    //console.log(response);
}

function addCompany(company) {
    // For the first time this function is called, delete the 'unknown' company option.
    var unknownIndex = appViewModel.companyOptions().indexOf(defaultCompanyOption);
    if (unknownIndex > -1) appViewModel.companyOptions().splice(unknownIndex,1);

    var companyId = company.entityId ;
    var companyName = company.name;
    if (!(companyId && companyName)) {
        console.warn("company " + JSON.stringify(company) + " not added to model because of missing values.");
    }
    console.log("Adding company " + companyName + " with id: " + companyId);
    if (companyNameToId[companyName]) {
        console.log("Company " + companyName + " already added, not adding again");
        return;
    } else {
        companyNameToId[companyName] = companyId;
    }

    appViewModel.companyOptions().push(companyName);
    appViewModel.companyOptions(appViewModel.companyOptions().sort());

    storeCompanyCacheDebounced();
}

var storeCompanyCacheDebounced = _.debounce(storeCompanyCache, 2000); // No new companies for two seconds? Store the current list as cache.

function storeCompanyCache() {
    var companyCacheObj = { timestamp: Date.now(), companies: appViewModel.companyOptions(), companyNameToId: companyNameToId};
    console.log("Storing company cache at timestamp: " + companyCacheObj.timestamp);
    localStorage.setItem(COMPANYCACHEKEY, JSON.stringify(companyCacheObj));
}

function getCompanyCache() {
    var companyCacheStr = localStorage.getItem(COMPANYCACHEKEY);
    if (!companyCacheStr || companyCacheStr == "") return null;

    try {
        return JSON.parse(companyCacheStr);
    } catch(error) {
        console.log("Error occured trying to parse companyCache json:" + error);
        return null;
    }
}

function clearCompanyCache() {
    localStorage.setItem(COMPANYCACHEKEY, null);
}

function checkExistsInResponse(response, key, cb) {
    if (!response[key]) {
        cb(new Error("Response " + JSON.stringify(response) + " does not have key " + key));
        return false;
    }
    return true;
}

function retrieveResellerCompanies(resellerUrlId, cb) {
    console.log("Retrieving reseller companies for reseller " + resellerUrlId);

    restHelper.restAjaxRequest(resellerUrlId+"/entitiesFiltered?filter=reseller", null, function(response){
        var resellers = response;
        for (var resellerKey in resellers) {
            var reseller = resellers[resellerKey];
            console.log("Also retrieving companies for reseller: " + reseller.self );
            retrieveResellerCompanies(reseller.self, function(err, result) {
               if (err) {
                   cb(err);
                   return;
               }
            });
        }
    }, function(response) {
        cb(new Error(response));
    });

    async.waterfall([
        // Retrieve the Companies under the reseller.
        function(cb) {
            restHelper.restAjaxRequest(resellerUrlId+"/entitiesFiltered?filter=company", null, function(response){
                cb(null, response);         // success
            }, function(response){
                cb(new Error(response));    // error
            });
        },
       // Add all companies to the list.
    ], function(err, result) {
        if (err) {
            console.log("Error occurred while retrieving companies: " + err + " Probably, the user doesn't have rights under his reseller.");
            //errorMessage("An error occured while retrieving companies: \n" + err);
            return;
        }

        var companies = result;
        // Allright, we should have the companies!
        for (var companyKey in companies) {
            var company = companies[companyKey];
            console.log(company);
            addCompany(company);
        }

        cb();
    });
}

// Retrieve other companies the user might have rights to.
function retrieveCompanies() {

    console.log("Retrieving companies and resellers that the user might have rights on.");

    // Caching
    var companyCacheObj = getCompanyCache();
    if (companyCacheObj) {
        var age = Date.now() - companyCacheObj.timestamp;
        console.log("Company cache age is " + age + "ms.");
        if (age < COMPANYCACHEREFRESHAGE) {
            console.log("Cache more recent than " + COMPANYCACHEREFRESHAGE / 1000 + "s... Not retrieving companies again.");
            companyNameToId = companyCacheObj.companyNameToId;
            appViewModel.companyOptions(companyCacheObj.companies);
            //console.log ("---- companyCacheObj:")
            //console.log(companyCacheObj);
            doneRetrievingCompanies();
            return;
        }
    }


    restHelper.restAjaxRequest("user", null, function(response){
        checkExistsInResponse(response, "entityId", function(){});
        var user = response;
        userId = user.entityId;

        restHelper.restAjaxRequest("user/" + userId + "/rights", null, function(response) {
            async.each(response, function(right, cb) {
                if (right.target.indexOf("company") != -1) {
                    restHelper.restAjaxRequest(right.target, null, function(response){
                        var company = response;
                        addCompany(company);
                        cb();
                    }, function(response){
                        cb(new Error(response));    // error
                    });
                } else if (right.target.indexOf("reseller") != -1){
                    retrieveResellerCompanies(right.target, cb);
                } else {
                    cb();
                }
            }, function(err, results){
                if (err) {
                    console.log("Error occurred while retrieving companies: " + err);
                    return;
                }

                doneRetrievingCompanies();
            });
        });

    }, function (response) {
        errorMessage("Couldn't retrieve /user. Try logging in again, or report this error.");
    });
}

function doneRetrievingCompanies() {
    // We're logged in!
    userLoggedIn();

    // Select a specific company if it was previously selected.
    if (loginInfo.selectedCompanyOption != defaultCompanyOption) {
        console.log("Trying to select company: " + loginInfo.selectedCompanyOption);
        appViewModel.selectedCompanyOption(loginInfo.selectedCompanyOption);
    }
}

function doDownloadCdr(type) {
    var fromDate = $('#fromdatetimepicker').data("DateTimePicker").date();
    var fromTimestamp = fromDate.format("YYYY-MM-DD");

    // Get company-id from input field, save selected company.
    var companyId = appViewModel.selectedCompanyId();
    loginInfo.selectedCompanyOption = appViewModel.selectedCompanyOption();
    saveLoginInfo();

    console.log("Downloading CDRs for company " + companyId + " and date " + fromTimestamp);
    if (appViewModel.selectedCompanyOption() == defaultCompanyOption) {
        errorMessage("It seems that you don't have read-rights on any company. Ask the company administrator for the required access level.");
        return;
    }
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
        case "userevents":
            var fromTimestampSeconds = fromDate.unix();
            var toTimestampSeconds = fromTimestampSeconds + 86400;
            var userEventDownloadUrl = getEventDownloadUrl(companyId, fromTimestampSeconds, toTimestampSeconds, "users");
            downloadFromUrl(userEventDownloadUrl, type);
            break;

        default:
            errorMessage("Asked to download an unknown type: " + type);
            return;
    }
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
        header: true
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
        $('#detailbackbutton').show();
    } else {
        prevData = parsed;
        prevType = type;
        $('#detailbackbutton').hide();
    }
}

function errorMessage(msg) {
    console.log("ERROR:" + msg);
    alert(msg);
}
