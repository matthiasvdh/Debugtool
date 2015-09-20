(function() {

    var defaultJidDomainPart = "uc.pbx.speakup-telecom.com";

    var exports = exports || {};
    var root = this;
    var lib = root.ResolveServer = {};
    exports = lib;

    if (typeof require !== 'undefined') {
        DnsResolv = require("../lib/DnsResolvJs/DnsResolv.js").DnsResolv;
        require("../lib/DnsResolvJs/StatDnsDnsResolv.js");
        require("../lib/DnsResolvJs/JsonDnsDnsResolv.js");
    }

    function connectServerFromJidDomain(jidDomain) {
        var deferred = jQuery.Deferred();
        if (jidDomain.indexOf("uc.") == 0) {
            var boshServer = getEnvWithPrefix("bosh", jidDomain);
            deferred.resolve(boshServer, 443);
        } else {
            var srvRequestName = "_xmpp-server._tcp." + jidDomain;
            console.log("Resolving: " + srvRequestName);

            var srvResponse = DnsResolv.resolve(srvRequestName, "SRV");

            srvResponse.done(function(dnsResponse){
                console.log("Got response:");
                console.log(dnsResponse);

                // No SRV record found.
                if (dnsResponse.responses.length == 0) {
                    var msg = "Could not discover connect-server for domain. Are you using the correct JID?";
                    alert(msg)
                    deferred.fail(msg);
                    return;
                }

                // SRV record found. Let's find the server for the environment.
                var responseString = dnsResponse.responses[0].rdata;
                var responseServer = responseString.split(" ")[3];
                console.log("Found XMPP server: " + responseServer);
                deferred.resolve(responseServer);
            });
        }
        return deferred;
    }
    lib.connectServerFromJidDomain = connectServerFromJidDomain;

    function parseLogin(login) {
        console.log("Parsing login " + login);

        var resultDeferred = jQuery.Deferred();
        var res = {};
        res.username = "";
        res.jid = "";
        res.rest_user = "";
        res.domain = "";
        res.xmpp_server = "";
        res.bosh_server = "";
        res.rest_server = "";
        res.given_login = login;
        res.given_domain = "";
        res.resultDeferred = resultDeferred;

        var dnsLookupDeferred = jQuery.Deferred();

        if (login.indexOf("@") != -1) {
            // A domain has been given. Determine whether XMPP server, or user@domain domain.
            var splitted = login.split("@");
            res.username = splitted[0];
            res.given_domain = splitted[1];

            if (res.given_domain.indexOf("uc") == 0) {
                console.log(res.given_domain + " looks like an XMPP server. Using as domain and xmpp_server.");
                res.domain = res.given_domain;
                res.xmpp_server = res.domain;
                res.rest_user = res.username;
                dnsLookupDeferred.resolve();
            } else {
                console.log(res.given_domain + " looks like a user@domain domain. Resolving XMPP server using DNS lookup.");
                res.domain = res.given_domain;
                res.jid = res.username + "@" + res.domain;
                res.rest_user = res.jid;
                connectServerFromJidDomain(res.given_domain).done(function(xmppServer) {
                    res.xmpp_server = xmppServer;
                    dnsLookupDeferred.resolve();
                });
            }

        } else {
            console.log("No domain-part in login. Assuming default: " + defaultJidDomainPart);
            res.username = login;
            res.domain = defaultJidDomainPart;
            res.xmpp_server = res.domain;
            res.rest_user = res.username;
            dnsLookupDeferred.resolve();
        }

        function getEnvWithPrefix(prefix, env) {
            var splitOnDot = env.split(".");
            splitOnDot[0] = prefix;
            return splitOnDot.join(".");
        }

        dnsLookupDeferred.done(function() {
            res.jid = res.username + "@" + res.domain;
            res.base_domain = getEnvWithPrefix("", res.xmpp_server);
            res.bosh_server = getEnvWithPrefix("bosh", res.xmpp_server);
            res.rest_server = getEnvWithPrefix("rest", res.xmpp_server);
            console.log("Login parsed:");
            console.log(res);
            res.resultDeferred.resolve(res);
        });


        return resultDeferred;
    }
    lib.parseLogin = parseLogin;


}).call(this);