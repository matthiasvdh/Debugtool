/*
 * DnsResolv resolver for http://api.statdns.com
 *
 * Beware! - As of end 2015, the public API has been closed. It's available as a paid service on:
 * https://market.mashape.com/fcambus/statdns
 */

(function() {
    var module = {};
    var lib = DnsResolv;

    module.SERVICENAME = "StatDns";
    module.PRIORITY = 10;
    module.SUPPORTEDTYPES = ["SRV", "A", "TXT", "AAAA", "CNAME", "MX"];
    module.BASEURL = "https://statdns-v1.p.mashape.com";
    module.APIKEY = "eoOrekWSsCmshZ62AQe5jp8B41Xjp12GBZ8jsnSz9fBOdPKWhT";

    function checkType(type) {
        if (!_.contains(module.SUPPORTEDTYPES, type)) {
            throw "Invalid or unknown type DNS Request type.";
        }
    }

    module.resolve = function(request) {

        if (!request) throw "Empty Request!";
        checkType(request.type);

        var url = module.BASEURL + "/" + request.name + "/" + request.type;
        if (DnsResolv.debug) DnsResolv.log("Calling " + url);

        var result = $.Deferred();
        ajaxRequest(url, request, result);
        return result;

    }

    function ajaxRequest(url, request, result) {
        $.ajax
        ({
            type: "GET",
            url: url,
            timeout: 10000,
            dataType: 'json',
            headers: {
                "X-Mashape-Key":  module.APIKEY
            },
            success: function(respObj) {
                if (DnsResolv.debug) {
                    DnsResolv.log("Got response:");
                    DnsResolv.log(respObj);
                }
                var responseArray = handleResponse(respObj);
                var responseObject = new lib.LibResponse(request,responseArray, module.SERVICENAME);
                result.resolve(responseObject);
            },
            error: function(respObj, textStatus) {
                result.reject("Request failed: " + textStatus);
            }
        });
    }

    function handleResponse(respObj) {
        var responseArr = Array();
        for (var key in respObj.answer) {
            var answer = respObj.answer[key];
            var rdata = answer.rdata;
            if (respObj.question[0].type == "SRV") {
                rdata = rdata.substr(0, rdata.length - 1);
            }
            var libResponseObj = new lib.Response(rdata, answer.name, answer.ttl);
            responseArr.push(libResponseObj);
        }
        return responseArr;
    }

    DnsResolv.resolvers.push(module);
}).call(this);
