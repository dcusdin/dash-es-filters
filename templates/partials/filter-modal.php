<!--
    Wrapped in a <template> and cloned into <body> by
    assets/js/dash-es-filter-modal.js's ($.fn.dashESFilterModal) own
    cloneModal() — Bootstrap modals need to live as a direct child of
    <body>, and this theme's own jQuery/Bootstrap bundle means $.fn.modal
    isn't usable, so real DOM clicks trigger show/hide instead.

    One shared layout, driven entirely by that plugin — never opened
    directly. Two modes:
      - 'manage' (manager.php) — .esf-modal-save-btn (Add/Copy) vs
        .esf-modal-update-btn + .esf-modal-save-as-new-btn (Edit), all going
        through $.dashESFilters.save().
      - 'apply' (a report page with a dash-data-selectors "filters"
        selectize component) — .esf-modal-apply-btn is the primary action
        (push into the chip list, no persistence, no name required);
        .esf-modal-apply-save-btn is secondary (push AND
        $.dashESFilters.save(), same name/duplicate validation as manage
        mode's Save).
    Whichever mode's buttons aren't in use stay permanently d-none — see
    createInstance() in dash-es-filter-modal.js.
-->
<?php
    // Resolve-a-page-by-slug, same lookup RITCP_LOCATION_PAGE_SLUG uses
    // elsewhere in the plugin (see e.g. kpi-metrics/templates/overview-table.php)
    // — but unlike that pattern, deliberately NOT falling back to a guessed
    // home_url('/'.slug.'/') when no matching page is found: this link is
    // only worth showing if the page actually exists, so an empty
    // $es_filter_manager_page here is exactly what tells dash-es-filter-modal.js
    // (createInstance()'s `if (managerUrl)` check) to leave it hidden rather
    // than point at a page that isn't there yet.
    //
    // Only ever shown in 'apply' mode — see the .esf-modal-manage-link wiring
    // in dash-es-filter-modal.js. Not relevant in 'manage' mode since that's
    // manager.php itself.
    $es_filter_manager_page = '';
    if (defined('RITCP_ES_FILTER_MANAGER_PAGE_SLUG')) {
        $es_filter_manager_pages = get_posts([
            'post_type'      => 'page',
            'name'           => RITCP_ES_FILTER_MANAGER_PAGE_SLUG,
            'posts_per_page' => 1,
        ]);
        if ($es_filter_manager_pages) {
            $es_filter_manager_page = get_permalink($es_filter_manager_pages[0]);
        }
    }
?>
<div class="modal" tabindex="-1" data-manager-url="<?= esc_url($es_filter_manager_page) ?>">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title esf-filter-modal-title">Add Filter</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>

            <div class="modal-body px-lg-5 py-lg-4">
                <!-- Hidden via d-none by default, shown by populateLoadSelect() in
                     dash-es-filter-modal.js once there's at least one Pre-built or
                     saved filter to offer — no point showing an empty picker. -->
                <section class="mb-4 mb-lg-5 esf-modal-load-section d-none">
                    <div class="form-row">
                        <div class="col-lg-12 mt-1">
                            <div class="card bg-light">
                                <div class="card-body pt-2">
                                    <div class="form-row mb-2 mt-1">
                                        <div class="col">
                                            <strong>Load a saved filter</strong>
                                        </div>
                                        <div class="col-auto">
                                            <!-- Shown only in 'apply' mode — see dash-es-filter-modal.js -->
                                            <a href="#" class="esf-modal-manage-link d-none ml-1 small" target="_blank" rel="noopener">Manage your saved filters <i class="fa fa-external-link"></i></a>
                                        </div>
                                    </div>
                                    <div>
                                        <select class="form-control esf-modal-load-select mb-2">
                                            <option value="" selected>Load a filter...</option>
                                        </select>
                                        <small class="form-text text-muted">
                                            Loads a Pre-built or Custom filter into the builder below — replaces whatever's currently there.
                                        </small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="mb-4 mb-lg-5">
                    <?php include __DIR__ . '/builder-tree.php'; ?>
                </section>

                <section>
                    <div class="esf-modal-name-fields">
                        <strong class="d-block mb-2">Save this filter as:</strong> 
                        
                        <div class="form-group">
                            <label class="text-muted small mb-1">Filter name <span class="text-danger">*</span></label>
                            <input type="text" class="form-control esf-modal-filter-name" required>
                            <!-- Apply mode only — Apply itself never reads this
                                field, so it's easy to assume typing a name here
                                renames the chip when only Apply and Save does
                                anything with it. See createInstance() in
                                dash-es-filter-modal.js. -->
                            <small class="form-text text-muted esf-modal-name-apply-hint d-none">Only used if you click Apply and Save — a plain Apply doesn't save or name this filter, and won't keep this name after the page reloads.</small>
                            <div class="invalid-feedback esf-modal-filter-name-error"></div>
                        </div>
                        <div class="form-group">
                            <label class="text-muted small mb-1">Filter description</label>
                            <textarea class="form-control esf-modal-filter-description" rows="3"></textarea>
                        </div>
                    </div>
                </section>
            </div>

            <div class="modal-footer justify-content-end">
                <button type="button" class="btn btn-primary esf-modal-save-btn">Save Filter</button>
                <button type="button" class="btn btn-primary d-none esf-modal-update-btn"></button>
                <button type="button" class="btn btn-link d-none esf-modal-save-as-new-btn">Save as new</button>
                <button type="button" class="btn btn-outline-form d-none esf-modal-apply-save-btn">Apply and Save</button>
                <button type="button" class="btn btn-primary d-none esf-modal-apply-btn">Apply</button>
            </div>
        </div>
    </div>
</div>
