<?php
    wp_enqueue_script('dash_es_filters', RITCP_REPORTING_URL . 'dash-es-filters/assets/js/dash-es-filters.js', ['jquery']);
    wp_localize_script('dash_es_filters', 'dashESFilterBuilderConfig', [
        'endpointUrl'   => admin_url('admin-ajax.php'),
        'presetsAction' => 'ritcp_es_filter_presets',
    ]);
    // FilterModel + FilterFields + TermsService + EsFilterTree — see
    // dash-es-filter-tree.js's own docblock for why all four live in this
    // one file (each has exactly one consumer: EsFilterTree itself). Lives
    // in the modal now (templates/partials/builder-tree.php, included from
    // filter-modal.php), not directly on this page.
    wp_enqueue_script('dash_es_filter_tree', RITCP_REPORTING_URL . 'dash-es-filters/assets/js/dash-es-filter-tree.js', ['jquery', 'dash_es_filters', 'dash_ade_js', 'selectize_js']);

    // $.fn.dashESFilterModal — the Add/Edit modal itself, shared with any
    // report page that wires up 'apply' mode against a live selectize-
    // options ("filters") component (see dash-es-filters/templates/test.php).
    wp_enqueue_script('dash_es_filter_modal', RITCP_REPORTING_URL . 'dash-es-filters/assets/js/dash-es-filter-modal.js', ['jquery', 'dash_es_filters', 'dash_es_filter_tree']);

    // Unique per shortcode instance — lets [ritcp_es_filter_manager] appear
    // more than once on a page without the dashESFilters:change namespace
    // below colliding between instances.
    $managerId = esc_attr(wp_unique_id('esf-manager-'));
    $isAdmin = current_user_can('administrator') ? 'true' : 'false';
?>

<div class="esf-manager container m-0 p-0" id="<?php echo $managerId; ?>">
    <p class="text-muted">Browse or manage your filters below — building and editing them happens in a popup, not on this page.</p>
    <?php include __DIR__ . '/partials/manage-filters.php'; ?>
</div>

<script>
    jQuery(function ($) {
        var $manager = $('#<?php echo $managerId; ?>');
        var isAdmin = <?php echo $isAdmin; ?>;

        var $rowTemplate = $('#esf-filter-row-item-template');
        var $presetsList = $manager.find('.esf-presets-list');
        var $presetsEmptyMsg = $manager.find('.esf-presets-empty');
        var $savedList = $manager.find('.esf-saved-list');
        var $savedEmptyMsg = $manager.find('.esf-saved-empty');
        var $savedDisabledMsg = $manager.find('.esf-saved-disabled');

        // Nothing can be saved anywhere without $.dashESFilters — not just
        // "Your Filters" (which has nothing to list), but also "Add new
        // filter" and each Preset row's Copy button, since both just call
        // .save() too.
        if (!$.dashESFilters.enabled) {
            $savedList.addClass('d-none');
            $savedDisabledMsg.removeClass('d-none');
            $manager.find('.esf-add-filter-btn').addClass('d-none');
        }

        // -- Modals ---------------------------------------------------------------
        // Bootstrap 4 here is bundled inside the theme's own webpack with its
        // own isolated jQuery instance, so $.fn.modal isn't available on
        // WordPress's jQuery. Bootstrap's modal behaviour is wired via
        // document-level listeners on real DOM click events though (its
        // "data-api"), which fire regardless of which jQuery registered
        // them — so we trigger native clicks instead. Same pattern as
        // dash-bookmarks/templates/save-bookmark-button.php. The Add/Edit
        // filter modal itself now lives in dash-es-filter-modal.js
        // ($.fn.dashESFilterModal) — this page just calls openManage() on it.
        function cloneModal(templateId) {
            var el = document.getElementById(templateId);
            var $modal = $(el.content.cloneNode(true)).find('.modal');
            $('body').append($modal);
            return $modal;
        }

        function modalShow($modal) {
            var btn = document.createElement('button');
            btn.setAttribute('data-toggle', 'modal');
            btn.setAttribute('data-target', '#' + $modal.attr('id'));
            document.body.appendChild(btn);
            btn.click();
            document.body.removeChild(btn);
        }

        function modalHide($modal) {
            var dismissBtn = $modal.find('[data-dismiss="modal"]')[0];
            if (dismissBtn) dismissBtn.click();
        }

        // Unique id — a fixed one here would collide if this shortcode ever
        // appears more than once on a page.
        var $deleteModal = cloneModal('esf-delete-filter-modal-template').attr('id', $manager.attr('id') + '-delete-filter-modal');

        $manager.dashESFilterModal({ mode: 'manage' });
        var filterModal = $manager.data('dashESFilterModal');

        function openFilterModal(filter, mode) {
            filterModal.openManage(filter, mode);
        }

        function confirmDeleteFilter(filter) {
            $deleteModal.find('.esf-delete-filter-name').text(filter.name);

            // .off() first — otherwise re-opening this modal for a different
            // filter would stack up an extra click handler (bound to the
            // previous filter) each time, since we never throw the modal away.
            $deleteModal.find('.esf-delete-confirm-btn').off('click').on('click', function () {
                $.dashESFilters.delete(filter.id);
                modalHide($deleteModal);
            });

            modalShow($deleteModal);
        }

        // `editable` toggles the Edit/Delete buttons — hidden for a Preset
        // row, since there's nothing of yours to edit in place or delete;
        // Copy is the only way to start something of your own from it.
        //
        // Copy opens the same modal as Add, pre-loaded with this filter's
        // rules — always Save-as-new, never Update — so naming happens in
        // the modal itself rather than an auto-generated "Copy of X" that'd
        // collide with itself on a second copy.
        //
        // Clicking the row itself (not one of its icon buttons) runs the
        // default action for that row type — Copy for a Preset row, Edit
        // for one of your own. Each icon button stops propagation so its
        // own click doesn't also trigger the row's default action.
        function renderRow(filter, editable) {
            var $row = $($rowTemplate.prop('content')).find('.list-group-item').clone();

            $row.find('.esf-filter-name').text(filter.name);
            $row.find('.esf-filter-description').text(filter.description);
            $row.find('.esf-filter-string').text(
                isAdmin ? filter.filterString : 'ES filter string only available to admins'
            );

            if ($.dashESFilters.enabled) {
                $row.find('.esf-filter-copy').on('click', function (e) {
                    e.stopPropagation();
                    openFilterModal(filter, 'add');
                });

                if (!editable) {
                    $row.on('click', function () { openFilterModal(filter, 'add'); });
                }
            } else {
                $row.find('.esf-filter-copy').remove();
            }

            if (editable) {
                $row.find('.esf-filter-edit').on('click', function (e) {
                    e.stopPropagation();
                    openFilterModal(filter, 'edit');
                });
                $row.find('.esf-filter-delete').on('click', function (e) {
                    e.stopPropagation();
                    confirmDeleteFilter(filter);
                });

                $row.on('click', function () { openFilterModal(filter, 'edit'); });
            } else {
                $row.find('.esf-filter-edit, .esf-filter-delete').remove();
            }

            return $row;
        }

        function renderPresets() {
            $.dashESFilters.presetsReady.then(function () {
                $presetsList.empty();
                var presets = $.dashESFilters.presets();
                presets.forEach(function (preset) {
                    $presetsList.append(renderRow(preset, false));
                });

                $presetsList.toggleClass('d-none', !presets.length);
                $presetsEmptyMsg.toggleClass('d-none', !!presets.length);
            });
        }

        function renderSaved() {
            if (!$.dashESFilters.enabled) return;

            $.dashESFilters.ready.then(function () {
                $savedList.empty();
                var filters = $.dashESFilters.all();
                filters.forEach(function (filter) {
                    $savedList.append(renderRow(filter, true));
                });

                $savedList.toggleClass('d-none', !filters.length);
                $savedEmptyMsg.toggleClass('d-none', !!filters.length);
            });
        }

        renderPresets();
        renderSaved();

        // Re-render Custom Filters whenever a save/delete happens anywhere.
        $(document).on('dashESFilters:change.<?php echo $managerId; ?>', renderSaved);

        $manager.find('.esf-add-filter-btn').on('click', function () {
            openFilterModal(null, 'add');
        });
    });
</script>
