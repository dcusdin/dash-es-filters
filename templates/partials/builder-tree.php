<?php
    // Field-picker + terms-picker widgets below — same version/theme
    // dash-data-selectors' term-filter.php already uses.
    wp_enqueue_script('selectize_js', 'https://cdnjs.cloudflare.com/ajax/libs/selectize.js/0.15.2/js/selectize.min.js', ['jquery']);
    wp_enqueue_style('selectize_css', RITCP_REPORTING_URL . 'TransactionReportV2/selectize/css/selectize.bootstrap4.css');

    // Drag-to-reorder rules within/between groups — same jquery-ui-sortable
    // + connectWith pattern dash-data-selectors/templates/selectize-options.php
    // already uses for its options modal's multi-list drag-and-drop.
    wp_enqueue_script('jquery-ui-sortable');

    wp_enqueue_style('dash_es_filter_tree_css', RITCP_REPORTING_URL . 'dash-es-filters/assets/css/dash-es-filter-tree.css');

    // Cache-busting — here rather than templates/manager.php because this
    // partial is the one piece both the manager page and
    // selectize-options.php's report pages include (via filter-modal.php),
    // after every one of these handles has been enqueued.
    require_once __DIR__ . '/../../helpers/asset-version.php';
    dash_es_filters_version_assets([
        'dash_es_filters'         => 'assets/js/dash-es-filters.js',
        'dash_es_filter_tree'     => 'assets/js/dash-es-filter-tree.js',
        'dash_es_filter_modal'    => 'assets/js/dash-es-filter-modal.js',
        'dash_es_filter_tree_css' => 'assets/css/dash-es-filter-tree.css',
    ]);
?>

<!-- The name/description fields and Save/Update actions live in the modal
     that hosts this (see filter-modal.php) — this partial is just the tree
     itself, so it has no save UI of its own. -->
<div class="esf-builder my-3">
    <div class="">
        <div class="form-row">
            <div class="col">
                <strong class="d-block mb-2">Show this data if…</strong>
                <p class="small text-muted">Rules in the same group are combined with AND - every one must match. <br>
                Add another group to combine with OR - a record matching any group's rules will be included.</p>
            </div>
            <div class="col-auto">
                <button type="button" class="btn btn-sm btn-link text-muted esf-tree-clear-btn">Clear all</button>
            </div>
        </div>
    </div>

    <div class="esf-tree"></div>

    <?php if (current_user_can('administrator')): ?>
        <div class="esf-tree-output-panel">
            <label class="small text-muted mb-1">Live output</label>
            <code class="esf-tree-preview d-block text-wrap"></code>
        </div>
    <?php endif; ?>

    <!-- Shown on save when a rule is still missing a field or a value —
         see EsFilterTree.prototype.isValid() and manager.php's
         saveFromModal(). -->
    <p class="esf-tree-incomplete-warning text-danger small mt-2 d-none">Every rule needs a field and a value before this filter can be saved.</p>

    <!-- Shown on save when these exact rules already match another saved
         filter — a new name alone can't fix that, so it's flagged here
         rather than on the name field (see manager.php's saveFromModal()). -->
    <p class="esf-tree-duplicate-warning text-danger small mt-2 d-none"></p>
</div>

<!-- One AND-ed group of rules — cloned once per group by dash-es-filter-tree.js.
     No label of its own — the static "Show this data if…" heading above
     covers the first group, and an .esf-tree-or-divider (below) is rendered
     between every pair of groups after that instead of a text label. -->
<template id="esf-tree-group-template">
    <div class="esf-tree-group">
        <div class="esf-tree-group-rules"></div>
        <button type="button" class="btn btn-sm btn-link esf-tree-add-condition-btn">+ Add another condition</button>
    </div>
</template>

<!-- Rendered between groups only — never before the first or after the
     last (see EsFilterTree.prototype.render() in dash-es-filter-tree.js). -->
<template id="esf-tree-or-divider-template">
    <div class="esf-tree-or-divider form-row align-items-center my-2">
        <div class="col"><hr></div>
        <div class="col-auto"><span class="badge badge-info">OR</span></div>
        <div class="col"><hr></div>
    </div>
</template>

<!-- Trailing stub after the last group — its button always starts a brand
     new OR-ed group, never adds to an existing one. No separate "Or…"
     heading — the button's own text already says it. -->
<template id="esf-tree-addgroup-template">
    <div class="esf-tree-group-stub my-3">
        <button type="button" class="btn btn-sm btn-outline-dark esf-tree-add-group-btn">+ Or add another group</button>
    </div>
</template>

<!-- One rule row — field + operator + value + remove action. Adding another
     AND-ed condition to the group happens once, via .esf-tree-add-condition-btn
     at the end of the group (see #esf-tree-group-template above), not
     per-row. The "is"/"is not" select is all the user sees; the real
     EQ/NE/IN/NIN operator is derived in JS from that plus the value's
     cardinality and kept only in memory (see dash-es-filter-tree.js), not as
     a form field here. .esf-tree-reorder-rule-btn is the drag handle for
     jquery-ui-sortable — see EsFilterTree.prototype._initSortable() in
     dash-es-filter-tree.js. -->
<template id="esf-tree-rule-template">
    <div class="esf-tree-rule">
        <div class="form-row">
            <div class="esf-tree-reorder-col col-auto d-none d-lg-block">
                <button type="button" class="esf-tree-reorder-rule-btn btn btn-sm text-muted" title="Reorder"><i class="fa fa-bars"></i></button>
            </div>
            <div class="col form-row">
                <div class="col-lg-4 mb-2">
                    <select class="esf-tree-field-select form-control"></select>
                </div>
                <div class="col-lg-2 mb-2">
                    <select class="esf-tree-mode-select form-control">
                        <option value="is">is</option>
                        <option value="isnot">is not</option>
                    </select>
                </div>
                <div class="col-lg-6 esf-tree-value-wrap position-relative">
                    <div class="esf-tree-value-loader position-absolute top-0 right-0 z-index-2 p-1 my-1 mx-3 d-none">
                        <div class="spinner-border spinner-border-sm text-muted" role="status"></div>
                    </div>
                    <input type="text" class="esf-tree-value-input form-control">
                    <small class="esf-tree-value-helper form-text text-muted"></small>
                </div>
            </div>
            <div class="col-auto">
                <button type="button" class="esf-tree-remove-rule-btn btn btn-outline-form text-danger" title="Remove rule">&times;</button>
            </div>
        </div>
    </div>
</template>
