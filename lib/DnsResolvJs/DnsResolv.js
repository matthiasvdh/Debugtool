(function() {

    /*
     * Settings
     */
    var resolverTimeout = 4000;     // If a resolver hasn't given a result in three seconds, move on to the next one.

    /*
     * Attach library under DnsResolv global.
     * Can be accessed as 'lib' within the library
     */
    var root = this;
    var lib = root.DnsResolv = {};

    lib.resolvers = Array();
    var resolversSorted = false;

    /**
     * Resolve a domain-name of a certain type.
     * @return a jQuery.Deferred() that is resolved with a LibResponse object when the domain-name is resolved.
     */
    lib.resolve = function (name, type) {
        // Order resolvers by priority
        if (!resolversSorted) {
            resolversSorted = true;
            lib.resolvers = _.sortBy(lib.resolvers, "PRIORITY");
        }

        // Check whether we have resolvers
        if (lib.resolvers.length == 0) {
            throw "DnsResolv:: No resolvers installed. Did you include any of the resolver modules, such as StatDnsDnsResolv.js?";
        }

        // Create request
        var request = new Request(name, type)

        // Try to resolve the request.
        var result = jQuery.Deferred();
        resolveWithNextResolver(request, result);

        return result;
    }

    /*
     * Debugging
     */
    lib.debug = true;
    lib.log = function(log) {console.log(log)};

    /*
     * Generic Library response object
     */
    lib.LibResponse = function(request, responses, serviceName) {
        this.request = request;
        this.responses = responses;
        this.serviceName = serviceName;
    }

    /*
     * DNS response object
     */
    lib.Response = function(rdata, name, ttl) {
        this.ttl = ttl || 0;
        this.rdata = rdata || "";
        this.name = name || "";
    }

    /*
     * DNS request object
     */
    function Request(name, type) {
        if ((name == null) || (name == "")) {
            throw "Empty request";
        }

        this.name = name;
        this.type = type;
        this.currentResolver = -1;
        this.completed = false;
    }

    /*
     * Try to resolve the request with any of the resolvers that haven't been used yet for this request,
     * with ascending order of priority.
     * @argument request the request to resolve
     * @argument result A jQuery.Deferred() that resolves if a result is found, or fails if none of the resolvers
     * can resolve the request.
     */
    function resolveWithNextResolver(request, result) {
        // Determine the next resolver
        var currentResolver = lib.resolvers[++request.currentResolver];
        if (!currentResolver) {
            var msg = "All resolvers either gave an error or timed out trying to resolve your request.";
            lib.log("DnsResolv:: " + msg);
            result.reject(msg);
            return;
        }

        // Try to use the current resolver
        var currentResolverResult;
        if (lib.debug) lib.log("Trying resolver: " + currentResolver.SERVICENAME );
        try {
            currentResolverResult = currentResolver.resolve(request);
        } catch(error) {
            if (lib.debug) console.log("resolver " + currentResolver.SERVICENAME + " threw an error: " + error);
            resolveWithNextResolver(request, result);
            return;
        }

        // Move on to the next resolver, if this one is taking too long.
        var timeout = _.delay(function(request, result, currentResolver) {
            return function(){
                if (lib.debug) lib.log(currentResolver.SERVICENAME + " took too long, trying next resolver.");
                resolveWithNextResolver(request, result);
            }
        }(request, result, currentResolver), resolverTimeout);

        // Debug
        if (lib.debug) {
            currentResolverResult.done(function (answer) {
                console.log("Received answer from resolver " + currentResolver.SERVICENAME + ":");
                console.log(answer);
            });
            currentResolverResult.fail(function(error) {
                console.log("Received error from resolver " + currentResolver.SERVICENAME + ":");
                console.log(error);
            });
        }

        // Handle a resolver that fails.
        currentResolverResult.fail(function(request, result, timeout) {
            return function(){
                resolveWithNextResolver(request, result);
                clearTimeout(timeout);
            }
        }(request, result, timeout));

        // Handle a resolver that returns a result.
        currentResolverResult.done(function(request, result, timeout) {
            return function(resolverResult){
                request.completed = true;
                clearTimeout(timeout);
                result.resolve(resolverResult);
            }
        }(request, result, timeout));
    }



}).call(this);