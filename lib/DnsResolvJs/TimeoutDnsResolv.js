/*
 * DnsResolv resolver for http://api.statdns.com
 */

(function() {
    var module = {};
    var lib = DnsResolv;

    module.SERVICENAME = "Timeout";
    module.PRIORITY = 1;
    module.SUPPORTEDTYPES = ["SRV", "A", "TXT", "AAAA", "CNAME", "MX"];

    function checkType(type) {
        if (!_.contains(module.SUPPORTEDTYPES, type)) {
            throw "Invalid or unknown type DNS Request type.";
        }
    }

    module.resolve = function(request) {

        if (!request) throw "Empty Request!";
        checkType(request.type);

        var result = $.Deferred();
        return result;
    }



    DnsResolv.resolvers.push(module);
}).call(this);
