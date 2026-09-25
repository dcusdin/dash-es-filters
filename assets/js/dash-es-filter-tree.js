/**
 * ES Filter Builder — data model + serializer/parser.
 *
 * Ported as-is from the dash-es-filter-builder concept project's js/model.js
 * — pure logic, no DOM, no client-specific data. Lives in this file because
 * EsFilterTree below is its only real consumer — nothing else in this
 * plugin (or found elsewhere in this codebase) parses/builds the "j|{...}"
 * format, so there was no case for a separate standalone file.
 *
 * Internal representation is a plain JS object tree. We only ever convert
 * to/from the "j|{...}" string format at the boundaries (serialize() / parse()) —
 * nothing in the UI code should touch that string directly.
 *
 * Shape: a fixed two-level tree — OR across groups, AND within a group.
 * This is disjunctive normal form: it can express any AND/OR combination
 * without needing arbitrary recursive nesting in the UI.
 *
 *   Group:      { id, conditions: [ ...Condition ] }   — conditions are AND-ed
 *   root:       [ ...Group ]                            — groups are OR-ed
 *
 * Condition:  { id, field: "fieldkey", operator: "EQ"|"NE"|"IN"|"NIN", value: "<raw text>" }
 *
 * `value` is always the raw string from the rule's canonical value input —
 * whatever widget is shown to the user (plain text, date picker, terms
 * multi-select) writes back into that one field. For IN/NIN it's split on
 * commas into an array at serialise time; for EQ/NE it's used as-is.
 */
var FilterModel = (function () {
    "use strict";

    var idCounter = 0;
    function nextId() {
        idCounter += 1;
        return "n" + idCounter;
    }

    function createGroup(conditions) {
        return { id: nextId(), conditions: conditions || [] };
    }

    function createCondition(field, operator, value) {
        return {
            id: nextId(),
            field: field || "",
            operator: operator || "EQ",
            value: value || "",
        };
    }

    function splitValues(raw) {
        return String(raw || "")
            .split(",")
            .map(function (s) {
                return s.trim();
            })
            .filter(function (s) {
                return s.length > 0;
            });
    }

    function conditionToJSON(condition) {
        var body = {};
        if (condition.operator === "IN" || condition.operator === "NIN") {
            body[condition.field] = splitValues(condition.value);
        } else {
            body[condition.field] = condition.value;
        }
        var out = {};
        out[condition.operator] = body;
        return out;
    }

    function groupToJSON(group) {
        return { AND: group.conditions.map(conditionToJSON) };
    }

    /**
     * Serialise groups (OR-of-AND) to "j|{...}". A single group serialises as
     * a plain {"AND":[...]} with no outer OR wrapper — matches the spec's
     * examples for the single-group case.
     */
    function serialize(groups) {
        var body;
        if (!groups || groups.length === 0) {
            body = { AND: [] };
        } else if (groups.length === 1) {
            body = groupToJSON(groups[0]);
        } else {
            body = { OR: groups.map(groupToJSON) };
        }
        return "j|" + JSON.stringify(body);
    }

    // --- Parsing -----------------------------------------------------------

    function conditionFromJSON(obj) {
        var op = Object.keys(obj)[0]; // EQ | NE | IN | NIN
        var body = obj[op];
        var field = Object.keys(body)[0];
        var rawValue = body[field];
        var value = Array.isArray(rawValue) ? rawValue.join(", ") : String(rawValue);
        return createCondition(field, op, value);
    }

    function groupFromJSON(obj) {
        var arr = obj.AND || [];
        var conditions = arr.map(function (item) {
            var key = Object.keys(item)[0];
            if (key === "AND" || key === "OR") {
                throw new Error(
                    "This builder only supports a flat OR-of-AND-groups shape — nested AND/OR groups inside a group aren't supported."
                );
            }
            return conditionFromJSON(item);
        });
        return createGroup(conditions);
    }

    /**
     * Parse a "j|{...}" string into an array of groups (OR-of-AND).
     * Throws an Error with a human-readable message on malformed or
     * unsupported (arbitrarily nested) input.
     */
    function parse(str) {
        if (typeof str !== "string") {
            throw new Error("Filter string must be text.");
        }
        var trimmed = str.trim();
        if (trimmed.indexOf("j|") !== 0) {
            throw new Error('Filter string must start with "j|".');
        }
        var jsonPart = trimmed.slice(2);
        var parsed;
        try {
            parsed = JSON.parse(jsonPart);
        } catch (e) {
            throw new Error("Invalid JSON after \"j|\": " + e.message);
        }
        if (!parsed || typeof parsed !== "object") {
            throw new Error("Root of filter must be an AND or OR group.");
        }
        var rootKey = Object.keys(parsed)[0];
        if (rootKey === "AND") {
            return [groupFromJSON(parsed)];
        }
        if (rootKey === "OR") {
            return (parsed.OR || []).map(function (g) {
                var gKey = Object.keys(g)[0];
                if (gKey !== "AND") {
                    throw new Error("Each OR branch must be a plain AND group — nested OR/AND trees aren't supported by this builder.");
                }
                return groupFromJSON(g);
            });
        }
        throw new Error("Root of filter must be an AND or OR group.");
    }

    return {
        createGroup: createGroup,
        createCondition: createCondition,
        serialize: serialize,
        parse: parse,
    };
})();

/**
 * FilterFields — the pickable field list for the ES Filter Builder, sourced
 * from the real ADE backend via $.dashADE (see dash-data-selectors), not a
 * mock/static file like the concept project used (js/fields.js there read
 * from window.GROUP_OPTIONS, placeholder data modeled on this real shape).
 *
 * Uses the 'ade_groups' endpoint — the same group-by dimensions used
 * elsewhere (e.g. report builders), not 'ade_filters'.
 *
 * Lives in this file (rather than its own, the way $.dashADE itself does)
 * because EsFilterTree below is its only consumer — unlike $.dashADE, which
 * is genuinely shared across many different widgets elsewhere in this
 * codebase, nothing else here needs a field list.
 *
 * Callers must wait on FilterFields.ready before calling buildFieldList()/
 * getFieldDef() — mirrors $.dashADE.retrieve()'s own null-until-loaded
 * contract (see dashADE.js).
 */
var FilterFields = (function ($) {
    "use strict";

    function buildFieldList() {
        var raw = $.dashADE.retrieve('ade_groups') || {};
        var list = [];

        Object.keys(raw).forEach(function (fieldKey) {
            var def = raw[fieldKey];

            list.push({
                field: fieldKey,
                displayName: def['Display Name'] || fieldKey,
                info: def.Info || '',
                category: def.Category || 'Other',
            });
        });

        list.sort(function (a, b) {
            if (a.category !== b.category) return a.category < b.category ? -1 : 1;
            return a.displayName < b.displayName ? -1 : 1;
        });

        return list;
    }

    function getFieldDef(fieldKey) {
        return ($.dashADE.retrieve('ade_groups') || {})[fieldKey];
    }

    function getDisplayName(fieldKey) {
        var def = getFieldDef(fieldKey);
        return (def && def['Display Name']) || fieldKey;
    }

    /**
     * Which value control a field's rule should show. "text" (the default)
     * means the rule's canonical value input is shown as-is; anything else
     * means it gets hidden and a type-specific widget layered on top that
     * mirrors back into it.
     */
    function resolveValueControl(fieldKey) {
        var def = getFieldDef(fieldKey);
        if (!def) return 'text';
        if (def.ExportFormat === 'date_local') return 'date';
        if (def.AllowTermsList) return 'terms';
        return 'text';
    }

    return {
        ready: $.dashADE.preload(['ade_groups']),
        buildFieldList: buildFieldList,
        getFieldDef: getFieldDef,
        getDisplayName: getDisplayName,
        resolveValueControl: resolveValueControl,
    };
})(jQuery);

/**
 * TermsService — distinct-value lookup for AllowTermsList fields, used by
 * the builder tree's terms picker widget. Same "only one consumer" reasoning
 * as FilterFields above for why this lives here rather than its own file.
 *
 * Ported from the concept project's js/terms.js, but calling the real
 * ritcp_ade_terms admin-ajax action directly (same call dash-data-selectors'
 * term-filter.php already makes) instead of a mock fallback — this plugin
 * always runs inside WordPress, so there's no "standalone" case to fall
 * back for.
 *
 * Response shape from ritcp_ade_terms: { results: [ { "<fieldkey>": "0500 -
 * Box Park", ... }, ... ] } — one row object per distinct value.
 *
 * NOTE: no server-side search param — this fetches the full term list once
 * per field (cached) and lets Selectize's own local search filter it as the
 * user types, matching term-filter.php's own approach.
 */
var TermsService = (function ($) {
    "use strict";

    var cache = {}; // fieldKey -> Promise<[{value, text}]>

    function fetchTerms(fieldKey) {
        if (!cache[fieldKey]) {
            cache[fieldKey] = $.ajax({
                url: dashESFilterBuilderConfig.endpointUrl,
                data: { action: 'ritcp_ade_terms', groupby: fieldKey },
            }).then(function (data) {
                return (data.results || []).map(function (row) {
                    var v = row[fieldKey];
                    return { value: v, text: v };
                });
            }).catch(function (err) {
                console.error('[TermsService] failed to load terms for "' + fieldKey + '":', err);
                return [];
            });
        }
        return cache[fieldKey];
    }

    return {
        fetchTerms: fetchTerms,
    };
})(jQuery);

/**
 * EsFilterTree — the actual rule-building tree (rows AND-ed within a group,
 * groups OR-ed), ported from the concept project's js/app.js. Applied via
 * $.fn.dashESFilterTree (see bottom of file) for each manager instance.
 *
 * Rendering strategy: full re-render of the tree on every change — same
 * trade-off the concept made (see its js/app.js docblock): simple, no
 * DOM-diffing bugs, acceptable since edits are discrete (pick a field,
 * change a mode, add/remove a rule) rather than continuous keystrokes,
 * except typing into the plain-text value input, which updates the model
 * directly without a re-render.
 *
 * Markup for one row/group is never built here — both are partials cloned
 * from #esf-tree-rule-template / #esf-tree-group-template / *-addgroup-*
 * (see templates/partials/builder-tree.php). This file only fills in
 * text/selectize options and wires events on what's already there.
 */
(function ($) {
    "use strict";

    // The operator select (EQ/NE/IN/NIN) is canonical but never shown to the
    // user — they only ever see a 2-option "is"/"is not" toggle. The real
    // operator is derived from that toggle plus how many values are
    // currently in the value field, exactly like EQ/NE become IN/NIN once a
    // second value is added. Kept only on the in-memory condition object —
    // no hidden form field needed for it (unlike the concept's app.js).
    var OP_TO_MODE = { EQ: "is", IN: "is", NE: "isnot", NIN: "isnot" };

    function countValues(raw) {
        return String(raw || "")
            .split(",")
            .map(function (s) { return s.trim(); })
            .filter(function (s) { return s.length > 0; }).length;
    }

    function deriveOperator(mode, valueCount) {
        var multi = valueCount >= 2;
        if (mode === "isnot") return multi ? "NIN" : "NE";
        return multi ? "IN" : "EQ";
    }

    // Page-wide, not per-tree-instance — only one Selectize dropdown can
    // ever be visibly open on screen at once, regardless of which rule or
    // which tree it belongs to (field-select and terms-select both use this).
    // Mixed into a Selectize config's onDropdownOpen/onDropdownClose.
    var openSelectizeInstance = null;

    // Unique per EsFilterTree instance, not per-render — jquery-ui-sortable's
    // connectWith needs a class shared by every group's rules list *within
    // this tree only*, so dragging a rule between groups works but two
    // separate modal instances on the same page (unlikely, but possible)
    // never cross-connect. Assigned lazily on first render() — see
    // _initSortable().
    var sortableInstanceCounter = 0;
    function withExclusiveDropdown(config) {
        return $.extend({}, config, {
            onDropdownOpen: function () {
                if (openSelectizeInstance && openSelectizeInstance !== this) {
                    openSelectizeInstance.close();
                }
                openSelectizeInstance = this;
            },
            onDropdownClose: function () {
                if (openSelectizeInstance === this) openSelectizeInstance = null;
            },
        });
    }

    // Two out-of-the-box multi-select Selectize bugs, fixed the same way as
    // dash-data-selectors/templates/selectize-options.php:
    //  1. Clicking an option blurs the input, so you can't type straight
    //     after picking — refocus on every item add.
    //  2. Picking an option jumps the dropdown back to the top. addItem()
    //     re-renders via refreshOptions() (resets scrollTop), then
    //     setActiveOption() scrolls to the next option, then the refocus
    //     queues another refreshOptions(). Hold the scroll position for the
    //     whole add cycle and only release it after focus()'s own delayed
    //     refresh — _pendingAdds covers several adds overlapping.
    // Call AFTER seeding initial items, otherwise each seeded item would
    // steal focus on render.
    function keepFocusAndScrollOnAdd(inst) {
        var dropdownScrollTop = null;
        var pendingAdds = 0;

        var _refreshOptions = inst.refreshOptions.bind(inst);
        inst.refreshOptions = function (triggerDropdown) {
            if (dropdownScrollTop === null) return _refreshOptions(triggerDropdown);
            var scrollTop = dropdownScrollTop;
            _refreshOptions(triggerDropdown);
            if (inst.isOpen) inst.$dropdown_content.scrollTop(scrollTop);
        };

        var _setActiveOption = inst.setActiveOption.bind(inst);
        inst.setActiveOption = function ($option, scroll, animate) {
            if (dropdownScrollTop !== null) scroll = false;
            return _setActiveOption($option, scroll, animate);
        };

        var _addItem = inst.addItem.bind(inst);
        inst.addItem = function (value, silent) {
            dropdownScrollTop = inst.isOpen ? inst.$dropdown_content.scrollTop() : null;
            _addItem(value, silent);
        };

        inst.on('item_add', function () {
            pendingAdds++;
            setTimeout(function () {
                inst.focus();
                setTimeout(function () {
                    if (dropdownScrollTop !== null && inst.isOpen) {
                        inst.$dropdown_content.scrollTop(dropdownScrollTop);
                    }
                    pendingAdds = Math.max(0, pendingAdds - 1);
                    if (pendingAdds === 0) dropdownScrollTop = null;
                }, 0);
            }, 0);
        });
    }

    function EsFilterTree($builder) {
        this.$builder = $builder;
        this.$tree = $builder.find('.esf-tree');
        this.$preview = $builder.find('.esf-tree-preview');

        this.$groupTemplate = $('#esf-tree-group-template');
        this.$addGroupTemplate = $('#esf-tree-addgroup-template');
        this.$ruleTemplate = $('#esf-tree-rule-template');
        this.$orDividerTemplate = $('#esf-tree-or-divider-template');

        var self = this;
        FilterFields.ready.then(function () {
            self.fieldList = FilterFields.buildFieldList();
            self.groups = [self._makeEmptyGroup()];
            self.render();
        });
    }

    // -- Model helpers --------------------------------------------------------

    // A new rule starts with no field selected — defaulting to the list's
    // first field (the concept project's original behaviour) pre-fills the
    // field-select's Selectize instance with an item at init, which is what
    // was making it flaky; starting blank (placeholder shown) avoids that.
    EsFilterTree.prototype._makeEmptyCondition = function () {
        return FilterModel.createCondition("", "EQ", "");
    };

    EsFilterTree.prototype._makeEmptyGroup = function () {
        return FilterModel.createGroup([this._makeEmptyCondition()]);
    };

    EsFilterTree.prototype._findCondition = function (id) {
        var found = null;
        this.groups.forEach(function (group) {
            group.conditions.forEach(function (condition) {
                if (condition.id === id) found = condition;
            });
        });
        return found;
    };

    EsFilterTree.prototype._removeCondition = function (group, condition) {
        var idx = group.conditions.indexOf(condition);
        if (idx !== -1) group.conditions.splice(idx, 1);

        if (group.conditions.length === 0) {
            var groupIdx = this.groups.indexOf(group);
            if (this.groups.length > 1) {
                this.groups.splice(groupIdx, 1);
            } else {
                // Always leave at least one editable row in the last remaining group.
                group.conditions.push(this._makeEmptyCondition());
            }
        }
    };

    // -- Public API -----------------------------------------------------------

    // Replaces the whole tree with a parsed "j|{...}" string — used by
    // "Load a saved filter".
    EsFilterTree.prototype.load = function (filterString) {
        this.groups = FilterModel.parse(filterString);
        this.render();
    };

    // Resets to one blank group/rule — same starting state as first load.
    EsFilterTree.prototype.clear = function () {
        this.groups = [this._makeEmptyGroup()];
        this.render();
    };

    EsFilterTree.prototype.serialize = function () {
        return FilterModel.serialize(this.groups);
    };

    // Human-readable summary of the current rules — e.g. "Location is one of
    // (Bath, Bristol) and Category is Food". Used as a chip's display text
    // when it's pushed via component:addItem without a real saved name (see
    // dash-es-filter-modal.js's Apply button) — otherwise selectize-options.php
    // falls back to showing the raw j|{...} string (filterLabel() only
    // reformats when text === value).
    EsFilterTree.prototype.describe = function () {
        var self = this;
        var groupDescriptions = this.groups
            .map(function (group) {
                return group.conditions.map(function (condition) {
                    return self._describeCondition(condition);
                }).join(' and ');
            })
            .filter(function (d) { return d.length > 0; });

        return groupDescriptions.length > 1
            ? groupDescriptions.map(function (d) { return '(' + d + ')'; }).join(' or ')
            : (groupDescriptions[0] || '');
    };

    EsFilterTree.prototype._describeCondition = function (condition) {
        var label = FilterFields.getDisplayName(condition.field) || condition.field || '(no field)';
        var isNot = OP_TO_MODE[condition.operator] === "isnot";
        var values = countValues(condition.value) >= 2
            ? condition.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean)
            : [condition.value];

        if (values.length > 1) {
            return label + (isNot ? ' is not one of (' : ' is one of (') + values.join(', ') + ')';
        }
        return label + (isNot ? ' is not ' : ' is ') + (values[0] || '');
    };

    // False if any rule is still incomplete — no field chosen, or no value
    // entered. A fresh/blank rule starts in exactly this state, so without
    // this check a filter can be saved that doesn't actually filter on
    // anything (e.g. j|{"AND":[{"EQ":{"":""}}]}).
    EsFilterTree.prototype.isValid = function () {
        var valid = true;
        this.groups.forEach(function (group) {
            group.conditions.forEach(function (condition) {
                if (!condition.field || !String(condition.value || '').trim()) valid = false;
            });
        });
        return valid;
    };

    // -- Rendering ------------------------------------------------------------

    EsFilterTree.prototype.render = function () {
        var self = this;
        this.$tree.empty();

        // .esf-tree-or-divider goes *between* groups only — never before the
        // first or after the last, since there's nothing to OR against there.
        this.groups.forEach(function (group, i) {
            if (i > 0) self.$tree.append(self._renderOrDivider());
            self.$tree.append(self._renderGroup(group));
        });
        this.$tree.append(this._renderAddGroupStub());

        this.$tree.find('.esf-tree-rule').each(function () {
            var id = $(this).data('condition-id');
            var condition = self._findCondition(id);
            if (condition && condition._initWidgets) condition._initWidgets($(this));
        });

        this._initSortable();

        this._updatePreview();
    };

    // Drag-to-reorder — every group's rules list is a jquery-ui-sortable
    // connected to every other group's via a shared, tree-instance-scoped
    // class, so a rule can be dragged within its own group or into another
    // one. `handle` restricts drag-initiation to the reorder button;
    // `cancel: ''` overrides jquery-ui's own default cancel selector
    // ("input, textarea, button, select, option"), which would otherwise
    // block dragging from a <button> handle entirely.
    //
    // Full render() on every drop (_syncOrderFromDOM(), below) rather than a
    // partial DOM patch — consistent with this file's existing "full
    // re-render on every change" approach (see the module docblock), and a
    // drag-stop is exactly the kind of discrete, infrequent edit that
    // tradeoff is meant for.
    EsFilterTree.prototype._initSortable = function () {
        if (!this._sortableClass) {
            sortableInstanceCounter += 1;
            this._sortableClass = 'esf-tree-sortable-' + sortableInstanceCounter;
        }

        var self = this;
        this.$tree.find('.esf-tree-group-rules').addClass(this._sortableClass).sortable({
            connectWith: '.' + this._sortableClass,
            handle: '.esf-tree-reorder-rule-btn',
            cancel: '',
            placeholder: 'esf-tree-rule-placeholder',
            forcePlaceholderSize: true,
            tolerance: 'pointer',
            stop: function () {
                self._syncOrderFromDOM();
            },
        });
    };

    // Rebuilds this.groups from the current DOM order after a drag — reads
    // each .esf-tree-group-rules list top-to-bottom, resolving each rule's
    // data-condition-id back to its condition object via _findCondition()
    // (which searches across all existing groups, so this works regardless
    // of which group a condition started in). A group left empty because
    // every rule was dragged out of it is dropped — same "always leave
    // something behind" rule _removeCondition() already applies — unless
    // that would leave zero groups, in which case start over with one blank
    // condition rather than an empty tree.
    EsFilterTree.prototype._syncOrderFromDOM = function () {
        var self = this;
        var newGroups = [];

        this.$tree.find('.esf-tree-group-rules').each(function () {
            var conditions = [];
            $(this).find('.esf-tree-rule').each(function () {
                var condition = self._findCondition($(this).data('condition-id'));
                if (condition) conditions.push(condition);
            });
            if (conditions.length) newGroups.push(FilterModel.createGroup(conditions));
        });

        this.groups = newGroups.length ? newGroups : [this._makeEmptyGroup()];
        this.render();
    };

    EsFilterTree.prototype._renderOrDivider = function () {
        return $(this.$orDividerTemplate.prop('content')).find('.esf-tree-or-divider').clone();
    };

    EsFilterTree.prototype._renderGroup = function (group) {
        var $group = $(this.$groupTemplate.prop('content')).find('.esf-tree-group').clone();

        var $rules = $group.find('.esf-tree-group-rules');
        var self = this;
        group.conditions.forEach(function (condition) {
            $rules.append(self._renderRule(group, condition));
        });

        // One "Add another condition" per group (not per rule) — appends a
        // new AND-ed condition to this group.
        $group.find('.esf-tree-add-condition-btn').on('click', function () {
            group.conditions.push(self._makeEmptyCondition());
            self.render();
        });

        return $group;
    };

    EsFilterTree.prototype._renderAddGroupStub = function () {
        var $stub = $(this.$addGroupTemplate.prop('content')).find('.esf-tree-group-stub').clone();
        var self = this;

        $stub.find('.esf-tree-add-group-btn').on('click', function () {
            self.groups.push(self._makeEmptyGroup());
            self.render();
        });

        return $stub;
    };

    EsFilterTree.prototype._renderRule = function (group, condition) {
        var self = this;
        var $rule = $(this.$ruleTemplate.prop('content')).find('.esf-tree-rule').clone();
        $rule.attr('data-condition-id', condition.id);

        var $modeSelect = $rule.find('.esf-tree-mode-select');
        $modeSelect.val(OP_TO_MODE[condition.operator] || "is");

        var $valueInput = $rule.find('.esf-tree-value-input').val(condition.value);

        function syncOperator() {
            var mode = $modeSelect.val();
            condition.operator = deriveOperator(mode, countValues(condition.value));
            self._updatePreview();
        }

        $modeSelect.on('change', syncOperator);

        $valueInput.on('input', function () {
            condition.value = $(this).val();
            syncOperator();
        });

        $rule.find('.esf-tree-remove-rule-btn').on('click', function () {
            self._removeCondition(group, condition);
            self.render();
        });

        // Deferred until the row is attached to the DOM (Selectize needs
        // real layout) — called from render() after append.
        condition._initWidgets = function ($ruleEl) {
            self._initFieldSelect($ruleEl, condition);
            self._initValueWidget($ruleEl, condition, syncOperator);
        };

        return $rule;
    };

    EsFilterTree.prototype._initFieldSelect = function ($ruleEl, condition) {
        var self = this;

        $ruleEl.find('.esf-tree-field-select').selectize(withExclusiveDropdown({
            placeholder: "Choose a field…",
            valueField: "field",
            labelField: "displayName",
            searchField: ["displayName", "info"],
            optgroupField: "category",
            optgroupLabelField: "label",
            optgroupValueField: "value",
            optgroups: Array.from(new Set(this.fieldList.map(function (f) { return f.category; }))).map(function (cat) {
                return { value: cat, label: cat };
            }),
            options: this.fieldList,
            items: condition.field ? [condition.field] : [],
            onChange: function (value) {
                condition.field = value || "";
                // A value (or terms/date picked) for the old field rarely
                // makes sense against the new one — clear it, then a full
                // re-render creates a fresh, empty widget for whatever
                // control the new field resolves to.
                condition.value = "";
                condition.operator = deriveOperator(OP_TO_MODE[condition.operator] || "is", 0);
                self.render();
            },
        }));
    };

    // Two states only: a field either has a real terms list to pick from, or
    // it doesn't and the value is freeform text — nothing else to say for
    // "date" (the native picker needs no explanation), and nothing to say
    // when no field's been chosen yet.
    EsFilterTree.prototype._helperTextFor = function (controlType) {
        if (controlType === "terms") return "Choose one or more values from the list, or type your own.";
        if (controlType === "text") return "Type the exact value to match — separate multiple values with commas to match any of them.";
        return "";
    };

    EsFilterTree.prototype._initValueWidget = function ($ruleEl, condition, syncOperator) {
        var $hidden = $ruleEl.find('.esf-tree-value-input');
        var $helper = $ruleEl.find('.esf-tree-value-helper');
        var $loader = $ruleEl.find('.esf-tree-value-loader');
        var controlType = condition.field ? FilterFields.resolveValueControl(condition.field) : "";

        $helper.text(this._helperTextFor(controlType));

        // Nothing to match against until a field's chosen — leaving this
        // typeable before then invites a value that gets silently discarded
        // the moment a field is picked (see onChange in _initFieldSelect).
        if (!condition.field) {
            $hidden.prop('hidden', false).prop('disabled', true).attr('placeholder', 'Choose a field first…');
            return;
        }

        if (controlType === "date") {
            $hidden.prop('hidden', true);
            var $date = $('<input type="date" class="form-control">').val(condition.value);
            $date.on('change', function () {
                condition.value = $(this).val();
                $hidden.val(condition.value);
                syncOperator();
            });
            $hidden.after($date);
            return;
        }

        if (controlType === "terms") {
            $hidden.prop('hidden', true);
            var $termsInput = $('<input type="text" class="form-control">');
            $hidden.after($termsInput);

            var initialItems = condition.value
                ? condition.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean)
                : [];

            function syncFromItems(inst) {
                condition.value = inst.items.join(", ");
                $hidden.val(condition.value);
                syncOperator();
            }

            $termsInput.selectize(withExclusiveDropdown({
                plugins: ["remove_button"],
                delimiter: ",",
                // Must stay true: this Selectize version's addOption() flags
                // every option as user-created — including ones returned by
                // load() — so persist: false deletes a fetched term from the
                // list the moment its item is removed, and load() never
                // re-fetches it (loadedSearches caches the "" query).
                persist: true,
                create: true,
                createOnBlur: true,
                placeholder: "Type a value, press enter…",
                // Spinner column shown only while terms are being fetched —
                // fetchTerms() caches per field, so repeat loads resolve
                // immediately and it never visibly flashes.
                load: function (query, callback) {
                    $loader.removeClass('d-none');
                    TermsService.fetchTerms(condition.field)
                        .then(callback)
                        .catch(function () { callback(); })
                        .always(function () { $loader.addClass('d-none'); });
                },
                onItemAdd: function () { syncFromItems(this); },
                onItemRemove: function () { syncFromItems(this); },
            }));

            var termsInst = $termsInput[0].selectize;
            initialItems.forEach(function (v) {
                termsInst.createItem(v, false);
            });
            keepFocusAndScrollOnAdd(termsInst);
            termsInst.onSearchChange("");
            return;
        }

        // "text" (default): the hidden/canonical input IS the visible control.
        $hidden.prop('hidden', false).attr('placeholder', 'Type a value…');
    };

    EsFilterTree.prototype._updatePreview = function () {
        this.$preview.text(this.serialize());
    };

    // $.fn.dashESFilterTree — same "apply to a container" convention as
    // $.fn.esFilterBuilder. The instance is stashed via .data() so a caller
    // (templates/manager.php) can get it back to call .load()/.serialize()
    // later — standard jQuery-plugin pattern for a stateful widget.
    $.fn.dashESFilterTree = function () {
        return this.each(function () {
            $(this).data('dashESFilterTree', new EsFilterTree($(this)));
        });
    };
})(jQuery);
