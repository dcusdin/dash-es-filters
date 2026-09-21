// $.dashESFilters — data layer for the user's own Saved Filters, backed by
// the dash-personalisation plugin's REST API. Modeled directly on
// dash-bookmarks' $.dashBookmarks (see dash-bookmarks/assets/js/dash-bookmarks.js)
// so both share the same enable/cache/event shape.
//
// Silently disabled (enabled === false) when DashPersonalisation isn't
// present on the page — callers check `.enabled` before offering any save UI.
//
// Record shape: { id, name, description, filterString }
(function ($) {
    "use strict";

    var enabled  = typeof DashPersonalisation !== 'undefined';
    var endpoint = enabled ? DashPersonalisation.root + 'personalisation/saved_filter' : null;

    var filters = new Map(); // keyed by item_key -> { name, description, filterString }
    var presets = []; // Pre-built Filters — read-only, never touches `filters`/save()/delete()

    function toRecord(key, value) {
        return $.extend({ id: key }, value);
    }

    function newId() {
        return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    // Duplicate check runs against whatever's already in the cache (no extra
    // GET needed — `ready` has already populated it). Excludes the record
    // being saved itself, so re-saving an existing filter under its own
    // name/string isn't flagged as a clash with itself.
    //
    // Reports *which* criterion matched (nameMatches/stringMatches, either
    // or both) — a caller needs that to point the user at the actual
    // problem: a name clash belongs on the name field, but a string clash
    // means the rules themselves are identical to another saved filter,
    // which a new name alone can't fix.
    function findDuplicate(record) {
        var match = null;
        filters.forEach(function (value, key) {
            if (key === record.id) return;
            var nameMatches = (value.name || '').trim().toLowerCase() === (record.name || '').trim().toLowerCase();
            var stringMatches = (value.filterString || '').trim() === (record.filterString || '').trim();
            if (nameMatches || stringMatches) {
                match = $.extend(toRecord(key, value), { nameMatches: nameMatches, stringMatches: stringMatches });
            }
        });
        return match;
    }

    var ready = enabled
        ? $.ajax({ url: endpoint, headers: { 'X-WP-Nonce': DashPersonalisation.nonce } })
            .then(function (items) {
                $.each(items || [], function (i, item) {
                    filters.set(item.key, item.value);
                });
                return filters;
            })
            .catch(function (err) {
                console.error('[dashESFilters] failed to load:', err);
                return filters;
            })
        : $.Deferred().resolve(filters).promise();

    // Pre-built Filters never depend on dash-personalisation — this fetch
    // always runs, regardless of `enabled` above.
    var presetsReady = $.ajax({
        url: dashESFilterBuilderConfig.endpointUrl,
        type: 'POST',
        data: { action: dashESFilterBuilderConfig.presetsAction },
    }).then(function (response) {
        presets = response.results || [];
        return presets;
    }).catch(function (err) {
        console.error('[dashESFilters] failed to load presets:', err);
        return presets;
    });

    $.dashESFilters = {
        enabled: enabled,

        // Promise, resolves once the initial list has loaded (or immediately
        // with an empty set when disabled).
        ready: ready,

        // Promise, resolves once Pre-built Filters have loaded.
        presetsReady: presetsReady,

        presets: function () {
            return presets.slice();
        },

        all: function () {
            var records = [];
            filters.forEach(function (value, key) {
                records.push(toRecord(key, value));
            });
            return records;
        },

        get: function (id) {
            var value = filters.get(id);
            return value ? toRecord(id, value) : null;
        },

        // Upsert — a record with no `id` is created, otherwise it's updated
        // in place. Rejects with { reason: 'disabled' | 'duplicate', match }
        // without making a request in those cases; resolves with the saved
        // record (including its id) otherwise.
        save: function (filter) {
            if (!enabled) {
                return $.Deferred().reject({ reason: 'disabled' }).promise();
            }

            return ready.then(function () {
                var record = $.extend({}, filter);
                if (!record.id) record.id = newId();

                var duplicate = findDuplicate(record);
                if (duplicate) {
                    return $.Deferred().reject({ reason: 'duplicate', match: duplicate }).promise();
                }

                var value = {
                    name: record.name,
                    description: record.description,
                    filterString: record.filterString,
                };

                var toast = $.dashToast({ message: 'Saving filter...', state: 'pending' });

                return $.ajax({
                    url: endpoint,
                    method: 'POST',
                    contentType: 'application/json',
                    headers: { 'X-WP-Nonce': DashPersonalisation.nonce },
                    data: JSON.stringify({ key: record.id, value: value }),
                }).then(function () {
                    filters.set(record.id, value);
                    toast.update({ message: 'Filter saved', state: 'success' });
                    $(document).trigger('dashESFilters:change', [$.dashESFilters.all()]);
                    return toRecord(record.id, value);
                }, function (err) {
                    toast.update({ message: 'Failed to save filter', state: 'error' });
                    return $.Deferred().reject(err).promise();
                });
            });
        },

        // Rejects with { reason: 'disabled' } when there's nothing to call;
        // resolves once the item's gone from both the server and the cache.
        "delete": function (id) {
            if (!enabled) {
                return $.Deferred().reject({ reason: 'disabled' }).promise();
            }

            var toast = $.dashToast({ message: 'Deleting filter...', state: 'pending' });

            return $.ajax({
                url: endpoint + '/' + encodeURIComponent(id),
                method: 'DELETE',
                headers: { 'X-WP-Nonce': DashPersonalisation.nonce },
            }).then(function () {
                filters.delete(id);
                toast.update({ message: 'Filter deleted', state: 'success' });
                $(document).trigger('dashESFilters:change', [$.dashESFilters.all()]);
            }, function (err) {
                toast.update({ message: 'Failed to delete filter', state: 'error' });
                return $.Deferred().reject(err).promise();
            });
        },
    };
})(jQuery);
