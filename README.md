# dash-es-filters

Builds, saves, and applies Elasticsearch filters in the `j|{...}` string
format `dash-data-selectors`' `selectize-options` ("filters") component and
the wider reporting stack already use. Two ways to use it:

- **Filter Manager page** (`[ritcp_es_filter_manager]`) — browse Pre-built
  and your own saved filters, add/edit/copy/delete them.
- **Embedded in a report page** — open the same rule-building modal from any
  report that has a `selectize-options` ("filters") component, to add/edit a
  `j|` chip directly in that report's own filter dropdown.

Both share the same rule-building tree and modal — only the footer buttons
and what they do differ (Save/Update vs. Apply/Apply and Save).

---

## File structure

```
dash-es-filters/
├── README.md
├── index.php                              ← autoloader (glob actions/ + shortcodes/)
├── actions/
│   └── filter-presets.php                 ← wp_ajax_ritcp_es_filter_presets — fires the
│                                             ritcp_es_filter_presets filter, returns the result
├── shortcodes/
│   └── manager.php                        ← [ritcp_es_filter_manager]
├── templates/
│   ├── manager.php                        ← Filter Manager page (mode: 'manage')
│   └── partials/
│       ├── manage-filters.php             ← manager.php's list UI + wraps the two modal templates
│       ├── filter-modal.php               ← the Add/Edit/Apply modal itself (shared, both modes)
│       ├── builder-tree.php                ← the rule-building tree (name/description live in
│       │                                     filter-modal.php, not here)
│       └── delete-filter-modal.php        ← manage mode's delete confirmation
└── assets/
    ├── js/
    │   ├── dash-es-filters.js             ← $.dashESFilters — presets + saved-filter data layer
    │   ├── dash-es-filter-tree.js         ← FilterModel, FilterFields, TermsService, EsFilterTree
    │   └── dash-es-filter-modal.js        ← $.fn.dashESFilterModal
    └── css/
        └── dash-es-filter-tree.css
```

Client-specific presets don't live here — see [Presets](#presets) below.

---

## Rolling out to client sites

Each client keeps its own copy of this plugin (`dash-*-plugin-corp-reporting/`,
layout varies — sometimes root-level, sometimes nested under
`feature-modules/`). This repo is the source of truth; use the
`rollout-feature-module` skill (`.claude/skills/rollout-feature-module/`) to
sync changes out to every client copy on the current machine — invoke it
with `/client-sync`. It discovers the workspace root and each client's copy
by search rather than a hardcoded path list, since the dev root differs
machine to machine.

---

## The `j|{...}` format

```
j|{"AND":[{"EQ":{"locationname.keyword":"Bath"}},{"IN":{"salesmixgroup1.keyword":["Food","Beverage"]}}]}
j|{"OR":[{"AND":[...]},{"AND":[...]}]}
```

- Root is a single `AND` group, or an `OR` of `AND` groups (disjunctive
  normal form — the builder UI can only express this shape, not arbitrary
  nesting).
- Each condition is `{"EQ"|"NE"|"IN"|"NIN": {"<field>": "<value>" | ["<value>", ...]}}`.
  `IN`/`NIN` take an array; `EQ`/`NE` take a single string.
- This is the same format `dash-data-selectors/templates/selectize-options.php`
  already recognises for any `filters` component's `j|`-prefixed chips (see
  its own `filterIcon()`/`filterLabel()`), and the same format its
  `show_json_filter_modal` (jQuery QueryBuilder) feature also produces — this
  builder is the newer, dedicated alternative to that.

---

## Data layer — `$.dashESFilters`

`assets/js/dash-es-filters.js`. Modeled on `dash-bookmarks`' `$.dashBookmarks`.

| Member | Description |
|---|---|
| `enabled` | `true` if `DashPersonalisation` (the `dash-personalisation` plugin's JS global) is present on the page. Saved filters are silently unavailable when `false` — callers must check this before offering any save UI. |
| `ready` | Promise, resolves once the user's saved filters have loaded (or immediately, empty, when disabled). |
| `presetsReady` | Promise, resolves once Pre-built Filters have loaded. Always runs, independent of `enabled`. |
| `presets()` | `[{id, name, description, filterString}]` — Pre-built Filters, read-only. |
| `all()` | Same shape — your saved filters. |
| `get(id)` | One saved filter, or `null`. |
| `save(record)` | Upsert — no `id` creates, an `id` updates in place. Rejects with `{reason: 'disabled'}` or `{reason: 'duplicate', match}` (`match` carries `nameMatches`/`stringMatches` booleans) without making a request in either case. Resolves with the saved record (incl. `id`) otherwise. |
| `delete(id)` | Rejects with `{reason: 'disabled'}` if nothing to call; resolves once removed from both server and cache. |

Fires `dashESFilters:change` on `document` after every successful save/delete
(payload: `$.dashESFilters.all()`).

Backed by the `dash-personalisation` plugin's REST API
(`dash/v1/personalisation/saved_filter`) — a per-user key/value store, so
there's no cross-user collision risk on save.

Requires `dashESFilterBuilderConfig` localised on the page (`endpointUrl`,
`presetsAction`) — see any of the `wp_enqueue_script('dash_es_filters', ...)`
call sites for the exact `wp_localize_script` call to copy.

---

## Presets

Client-specific presets are **not** in this plugin — each client hooks its
own presets in via the generic `ritcp_es_filter_presets` WordPress filter
(fired by `actions/filter-presets.php`'s `wp_ajax` handler). For this site,
that's `global/actions/client-es-filter-presets.php`:

```php
add_filter('ritcp_es_filter_presets', 'ritcp_bowstreet_es_filter_presets', 10, 2);

function ritcp_bowstreet_es_filter_presets($presets, $user_id) {
    // ...append { id, name, description, filterString } entries to $presets...
    return $presets;
}
```

A preset with no `id` still works for display/loading, but can't be targeted
individually — give every preset a stable `id`. Presets are read-only:
they're never written back by `$.dashESFilters.save()`/`.delete()`, and
"Apply and Save"/"Copy" on one always creates a brand new saved filter rather
than mutating it.

---

## The rule-building tree — `assets/js/dash-es-filter-tree.js`

Three small internal helpers plus the tree widget itself — all in one file
because the tree is their only consumer (unlike `$.dashADE`, which is
genuinely shared across the codebase):

- **`FilterModel`** — pure `serialize(groups)` / `parse(filterString)` between
  the in-memory group/condition tree and the `j|{...}` string. `parse()`
  throws a human-readable `Error` on malformed or unsupported (arbitrarily
  nested) input — callers must catch it (see `loadFilterString()` in
  `dash-es-filter-modal.js`).
- **`FilterFields`** — the pickable field list, sourced from `$.dashADE`'s
  `ade_groups` endpoint (group-by dimensions, *not* `ade_filters`). Wait on
  `FilterFields.ready` before calling `buildFieldList()`/`getFieldDef()`.
- **`TermsService`** — distinct-value lookup (`ritcp_ade_terms`) for fields
  with `AllowTermsList`, cached per field.

**`EsFilterTree`** (`$.fn.dashESFilterTree()`) — the actual widget. Shape is
fixed two-level: groups are OR-ed, conditions within a group are AND-ed.
Full re-render on every change (add/remove/edit a rule, drag-drop) rather
than DOM-diffing — acceptable since edits are discrete, not continuous
keystrokes (typing into the value input is the one exception, which updates
the model directly without a re-render).

Public API (called via `$el.data('dashESFilterTree')`):

| Method | Description |
|---|---|
| `.load(filterString)` | Replaces the whole tree — **throws** on parse failure, caller must catch. |
| `.clear()` | Resets to one blank group/condition. |
| `.serialize()` | Current state → `j|{...}` string. |
| `.describe()` | Human-readable summary, e.g. `Location is one of (Bath, Bristol) and Category is Food` — used as a chip's display text when there's no real saved name (see `dash-es-filter-modal.js`'s Apply button). |
| `.isValid()` | `false` if any condition is missing a field or value — a fresh/blank rule starts in this state, so this guards against saving `j|{"AND":[{"EQ":{"":""}}]}`. |

Markup for groups/rules/the OR-divider is never built in JS — all cloned
from `<template>`s in `templates/partials/builder-tree.php`
(`#esf-tree-group-template`, `#esf-tree-rule-template`,
`#esf-tree-or-divider-template`, `#esf-tree-addgroup-template`). Edit that
file for layout changes; the JS only fills in text/Selectize options and
wires events on what's already there.

**Drag-to-reorder** — each group's `.esf-tree-group-rules` list is a
`jquery-ui-sortable`, connected to every other group's within the same tree
instance (so a rule can move within or between groups), handled via
`.esf-tree-reorder-rule-btn`. On drop, the model is rebuilt from the DOM
order and the whole tree re-renders (`_syncOrderFromDOM()`) — a group
emptied by the drag is dropped, unless it was the last one, in which case a
blank condition is added back rather than leaving nothing.

The "Live output" raw `j|{...}` preview panel (`.esf-tree-preview`) only
renders for `current_user_can('administrator')` — see `builder-tree.php`.

---

## The modal — `assets/js/dash-es-filter-modal.js`

`$.fn.dashESFilterModal({ mode: 'manage' | 'apply' })` — call once per
anchor element; the instance lives on `.data('dashESFilterModal')`. Wraps
`templates/partials/filter-modal.php`, cloned from a `<template
id="esf-filter-modal-template">` into `<body>` (Bootstrap modals need to be a
direct child of `<body>`; see the native-DOM-click workaround note in that
file's own docblock — this theme bundles its own isolated
jQuery+Bootstrap, so `$.fn.modal` isn't usable from WordPress's jQuery).

### `mode: 'manage'` — the Filter Manager page

`modal.openManage(filter, mode)`

- `filter` — `null` for a blank "Add new filter", otherwise loaded into the
  tree.
- `mode` — `'add'` or `'edit'`; only `'edit'` with `filter.id` set enables
  Update/Save as new. Save/Update/Save-as-new all go through
  `$.dashESFilters.save()`, with inline name-required + duplicate-name/rules
  validation (no `window.alert()`).

### `mode: 'apply'` — embedding in a report page

`modal.openApply({ value, onApply, onApplyAndSave })`

- `value` — an existing `j|{...}` string to pre-load (`null`/omitted for a
  blank add).
- `onApply(filterString, description)` — fires on **Apply**: no persistence,
  no name required, just `tree.isValid()`. `description` is
  `tree.describe()` — a readable summary, since there's no real name.
- `onApplyAndSave(filterString, name)` — fires on **Apply and Save**: same
  validation as manage mode's Save, going through `$.dashESFilters.save()`.
  `name` is the name the user typed and saved under.

This plugin doesn't know or care whether a filter string is a *new* chip or a
*replacement* — the caller tracks that itself and does the actual
`component:removeItem`(old) + `component:addItem`(new) dance. See the full
example below.

**Apply and Save** is hidden entirely when `$.dashESFilters.enabled` is
`false` (`DashPersonalisation` unavailable) — along with the whole
Name/Description block, since nothing on the modal would read them in that
case. "Manage your saved filters" (linking to the Filter Manager page, via
`RITCP_ES_FILTER_MANAGER_PAGE_SLUG` — see below) only shows in this mode
too, and only if that page actually exists.

---

## Embedding in a report page

The shape, then a full worked example:

1. **Enqueue the three scripts** `dash-es-filters`/`dash-es-filter-tree`/
   `dash-es-filter-modal` need, plus `wp_localize_script('dash_es_filters',
   'dashESFilterBuilderConfig', [...])` — same calls `manager.php` makes for
   `'manage'` mode.
2. **Render the modal's `<template id="esf-filter-modal-template">`**
   somewhere on the page (`<?php include .../partials/filter-modal.php; ?>`
   inside it) — `cloneModal()` looks it up by that id.
3. Your report's `selectize-options` component needs
   `'ade_setting' => 'filters'` and **`'edit_json_filters' => true`** (renders
   the edit-pencil on `j|` chips and emits `component:editItem` — see
   `dash-data-selectors/COMPONENTS.md`).
4. On `controller:ready`, call `$(...).dashESFilterModal({ mode: 'apply' })`
   once, and inject Presets/saved filters as pickable dropdown options via
   `component:addOptions` (re-run on `dashESFilters:change` to stay in
   sync — diff out stale entries with `component:removeOptions` first).
5. Listen for `component:editItem` on the filters component → `openApply({
   value })`, with `onApply`/`onApplyAndSave` doing `component:removeItem`
   (old) + `component:addItem`(new).
6. Wire an "Add filter" trigger → `openApply({ value: null })`, with
   `onApply`/`onApplyAndSave` just doing `component:addItem`.

### Worked example

```php
<?php
// Deps — same three scripts + localisation manager.php enqueues for 'manage' mode.
wp_enqueue_script('dash_es_filters', RITCP_REPORTING_URL . 'dash-es-filters/assets/js/dash-es-filters.js', ['jquery']);
wp_localize_script('dash_es_filters', 'dashESFilterBuilderConfig', [
    'endpointUrl'   => admin_url('admin-ajax.php'),
    'presetsAction' => 'ritcp_es_filter_presets',
]);
wp_enqueue_script('dash_es_filter_tree', RITCP_REPORTING_URL . 'dash-es-filters/assets/js/dash-es-filter-tree.js', ['jquery', 'dash_es_filters', 'dash_ade_js', 'selectize_js']);
wp_enqueue_script('dash_es_filter_modal', RITCP_REPORTING_URL . 'dash-es-filters/assets/js/dash-es-filter-modal.js', ['jquery', 'dash_es_filters', 'dash_es_filter_tree']);

$filter_selector = ritcp_do_shortcode('ritcp_Selector_Component_selectize_options', [
    'ade_setting'       => 'filters',
    'edit_json_filters' => true,
]);
?>

<div id="controller" class="dashDataController">
    <form>
        <?= $filter_selector ?>
        <button type="button" id="my-add-filter-btn" class="btn btn-outline-form"><i class="fa fa-magic"></i></button>
    </form>
</div>

<!-- cloneModal() in dash-es-filter-modal.js looks this up by id -->
<template id="esf-filter-modal-template">
    <?php include RITCP_REPORTING_DIR . 'dash-es-filters/templates/partials/filter-modal.php'; ?>
</template>

<script>
jQuery(function ($) {
    var $controller = $('#controller');
    var $filterComponent = $controller.find('[data-component-name="selectize-options"][data-ade-setting="filters"]');

    $(document.body).dashESFilterModal({ mode: 'apply' });
    var filterModal = $(document.body).data('dashESFilterModal');

    // Presets/saved filters as pickable dropdown options — kept in sync on
    // every $.dashESFilters change, diffing out stale entries first.
    var injectedValues = [];
    function injectFilterOptions() {
        $.when($.dashESFilters.presetsReady, $.dashESFilters.ready).done(function () {
            var options = $.dashESFilters.presets().map(function (f) {
                return { value: f.filterString, text: f.name, optgroup: 'Pre-built Filters' };
            }).concat(($.dashESFilters.enabled ? $.dashESFilters.all() : []).map(function (f) {
                return { value: f.filterString, text: f.name, optgroup: 'Your Filters' };
            }));

            var newValues = options.map(function (o) { return o.value; });
            var stale = injectedValues.filter(function (v) { return newValues.indexOf(v) === -1; });

            if (stale.length) $filterComponent.trigger('component:removeOptions', [stale]);
            $filterComponent.trigger('component:addOptions', [options]);
            injectedValues = newValues;
        });
    }

    $controller.on('controller:ready', function () {
        injectFilterOptions();
        $(document).on('dashESFilters:change', injectFilterOptions);
    });

    // Edit an existing j| chip — pencil icon click (edit_json_filters).
    $filterComponent.on('component:editItem', function (e, value) {
        filterModal.openApply({
            value: value,
            onApply: function (newValue, text) {
                $filterComponent.trigger('component:removeItem', [value]);
                $filterComponent.trigger('component:addItem', [newValue, text]);
            },
            onApplyAndSave: function (newValue, name) {
                $filterComponent.trigger('component:removeItem', [value]);
                $filterComponent.trigger('component:addOptions', [[{ value: newValue, text: name, optgroup: 'Your Filters' }]]);
                $filterComponent.trigger('component:addItem', [newValue, name]);
            },
        });
    });

    // Add a brand new filter — no old chip to remove.
    $('#my-add-filter-btn').on('click', function () {
        filterModal.openApply({
            value: null,
            onApply: function (newValue, text) {
                $filterComponent.trigger('component:addItem', [newValue, text]);
            },
            onApplyAndSave: function (newValue, name) {
                $filterComponent.trigger('component:addOptions', [[{ value: newValue, text: name, optgroup: 'Your Filters' }]]);
                $filterComponent.trigger('component:addItem', [newValue, name]);
            },
        });
    });
});
</script>
```

---

## `dash-data-selectors` integration

Two public events were added to
`dash-data-selectors/templates/selectize-options.php` specifically to
support this plugin, alongside its existing `component:addItem`/
`component:removeItem` — see `dash-data-selectors/COMPONENTS.md`'s
"Component Event API" section for full docs:

- **`component:addOptions`** — bulk-upsert raw dropdown *options* (not
  selection), `{value, text, optgroup}[]`. Uses `updateOption()` (re-renders
  an already-selected chip) rather than `addOption()` when the value already
  exists — matters for a chip that was restored from the URL before this
  plugin gets a chance to inject anything.
- **`component:removeOptions`** — bulk-remove options by value.

The `edit_json_filters` flag, its edit-pencil rendering, and the
`component:editItem` event it emits are also in that same file — deliberately
kept generic/reusable there rather than specific to this plugin, since
they're just standard Selectize chip rendering + a public event, nothing
`dash-es-filters`-specific.

---

## `RITCP_ES_FILTER_MANAGER_PAGE_SLUG`

Defined in the plugin root (`rit-corp-reporting.php`), same pattern as
`RITCP_LOCATION_PAGE_SLUG`: the WordPress page slug hosting
`[ritcp_es_filter_manager]`. Resolved to a real URL in `filter-modal.php` via
`get_posts()`/`get_permalink()` — unlike the location-page pattern, this
does **not** fall back to a guessed `home_url()` when no matching page is
found; the "Manage your saved filters" link simply stays hidden until a real
page with that slug exists.
