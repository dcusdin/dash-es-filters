// $.fn.dashESFilterModal — shared Add/Edit/Apply modal wrapping
// templates/partials/filter-modal.php (name/description + dash-es-filter-tree
// builder). Extracted out of manager.php's own inline script so a report
// page can reuse the same modal against a live selectize-options ("filters")
// component, not just against $.dashESFilters' saved-filter list.
//
// $('<anchor>').dashESFilterModal({ mode: 'manage' | 'apply' })
// Instance lives on the anchor's .data('dashESFilterModal') — call once per
// anchor; a second call on an anchor that already has one is a no-op.
//
// mode: 'manage' — Save (add) / Update + Save as new (edit), all going
//   through $.dashESFilters.save(). This is manager.php's own Add/Edit/Copy
//   flow, unchanged from before the extraction.
//     modal.openManage(filter, mode)
//       filter — null for a blank "Add new filter", otherwise loaded into
//         the tree.
//       mode — 'add' or 'edit'; only 'edit' with a filter.id enables
//         Update/Save as new.
//
// mode: 'apply' — Apply / Apply and Save, for pushing a filter into a live
//   selectize-options ("filters") chip list rather than the saved-filter
//   list. Apply just needs valid rules (no name); Apply and Save
//   additionally requires a name and goes through the same
//   $.dashESFilters.save() + duplicate handling as manage mode's Save.
//     modal.openApply({ value, onApply, onApplyAndSave })
//       value — an existing j|{...} string to pre-load, or null/undefined
//         for a blank add.
//       onApply / onApplyAndSave — receive the new filter string. This
//         plugin doesn't know or care whether that's a brand new chip or a
//         replacement for `value` — the caller tracks that itself (e.g. via
//         component:removeItem on the old value before component:addItem).
(function ($) {
    "use strict";

    var _instanceCount = 0;

    $.fn.dashESFilterModal = function (options) {
        options = options || {};
        var mode = options.mode || 'manage';

        this.each(function () {
            var $anchor = $(this);
            if ($anchor.data('dashESFilterModal')) return;
            $anchor.data('dashESFilterModal', createInstance(mode));
        });

        return this;
    };

    function createInstance(mode) {
        var instanceId = 'esf-filter-modal-' + (++_instanceCount);

        // -- Modal show/hide -----------------------------------------------------
        // Bootstrap 4 here is bundled inside the theme's own webpack with its
        // own isolated jQuery instance, so $.fn.modal isn't available on
        // WordPress's jQuery. Bootstrap's modal behaviour is wired via
        // document-level listeners on real DOM click events though (its
        // "data-api"), which fire regardless of which jQuery registered
        // them — so we trigger native clicks instead. Same pattern as
        // dash-bookmarks/templates/save-bookmark-button.php.
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

        var $filterModal = cloneModal('esf-filter-modal-template').attr('id', instanceId);

        var tree = null; // set on first use — see ensureTreeReady()
        var loadOptions = []; // in-modal "Load a filter..." select — index -> filter

        var $modalName = $filterModal.find('.esf-modal-filter-name');
        var $modalNameError = $filterModal.find('.esf-modal-filter-name-error');
        var $modalDuplicateWarning = $filterModal.find('.esf-tree-duplicate-warning');
        var $modalIncompleteWarning = $filterModal.find('.esf-tree-incomplete-warning');
        var $modalDescription = $filterModal.find('.esf-modal-filter-description');
        var $modalSaveBtn = $filterModal.find('.esf-modal-save-btn');
        var $modalUpdateBtn = $filterModal.find('.esf-modal-update-btn');
        var $modalSaveAsNewBtn = $filterModal.find('.esf-modal-save-as-new-btn');
        var $modalApplyBtn = $filterModal.find('.esf-modal-apply-btn');
        var $modalApplySaveBtn = $filterModal.find('.esf-modal-apply-save-btn');

        // Only the buttons for this instance's mode are ever shown — the
        // other set stays permanently hidden regardless of add/edit state.
        if (mode === 'apply') {
            $modalSaveBtn.addClass('d-none');
            $modalUpdateBtn.addClass('d-none');
            $modalSaveAsNewBtn.addClass('d-none');
            $modalApplyBtn.removeClass('d-none');
            $modalApplySaveBtn.toggleClass('d-none', !$.dashESFilters.enabled);

            // Name/description are only read by Apply and Save — hide them
            // entirely when that button isn't available, so a user with no
            // save path never sees a "required" field their Apply click
            // doesn't actually care about. When it *is* available, clarify
            // that plain Apply still ignores the name — see the field's own
            // hint markup in filter-modal.php.
            $filterModal.find('.esf-modal-name-fields').toggleClass('d-none', !$.dashESFilters.enabled);
            $filterModal.find('.esf-modal-name-apply-hint').toggleClass('d-none', !$.dashESFilters.enabled);

            // "Manage your saved filters" — only makes sense in apply mode;
            // in manage mode you're already on that page. data-manager-url
            // is resolved server-side in filter-modal.php from
            // RITCP_ES_FILTER_MANAGER_PAGE_SLUG (same pattern as
            // RITCP_LOCATION_PAGE_SLUG elsewhere in the plugin).
            var managerUrl = $filterModal.data('managerUrl');
            if (managerUrl) {
                $filterModal.find('.esf-modal-manage-link').attr('href', managerUrl).removeClass('d-none');
            }
        } else {
            $modalApplyBtn.addClass('d-none');
            $modalApplySaveBtn.addClass('d-none');
        }

        function populateLoadSelect() {
            $.when($.dashESFilters.presetsReady, $.dashESFilters.ready).done(function () {
                var presetFilters = $.dashESFilters.presets();
                var savedFilters = $.dashESFilters.enabled ? $.dashESFilters.all() : [];
                loadOptions = presetFilters.concat(savedFilters);

                var $select = $filterModal.find('.esf-modal-load-select');
                $select.find('option[value!=""], optgroup').remove();

                // Option values are indexes into the flat loadOptions array
                // — offset per group keeps them pointing at the right entry
                // regardless of which optgroup they're rendered under.
                function appendGroup(label, filters, offset) {
                    if (!filters.length) return;
                    var $group = $('<optgroup></optgroup>').attr('label', label);
                    filters.forEach(function (f, i) {
                        $group.append($('<option></option>').val(offset + i).text(f.name));
                    });
                    $select.append($group);
                }

                appendGroup('Pre-built Filters', presetFilters, 0);
                appendGroup('Your Filters', savedFilters, presetFilters.length);

                $filterModal.find('.esf-modal-load-section').toggleClass('d-none', !loadOptions.length);
            });
        }

        // One-time setup — the tree itself, "Clear all", and the in-modal
        // "Load a filter..." picker all only need wiring once; every
        // subsequent open call reuses this same instance.
        function ensureTreeReady() {
            if (tree) return;

            var $builderTree = $filterModal.find('.esf-builder');
            $builderTree.dashESFilterTree();
            tree = $builderTree.data('dashESFilterTree');

            $filterModal.find('.esf-tree-clear-btn').on('click', function () {
                if (!window.confirm('Clear the filter you\'re building? This can\'t be undone.')) return;
                tree.clear();
            });

            populateLoadSelect();
            $(document).on('dashESFilters:change.' + instanceId, populateLoadSelect);

            // Loads immediately on selection — no separate "Load" click.
            // There's no confirm() here (unlike Clear all), same as before
            // this was simplified: picking from this list was always a
            // one-shot "load this in" action, not something that needed a
            // second deliberate step to commit.
            $filterModal.find('.esf-modal-load-select').on('change', function () {
                var $select = $(this);
                var f = loadOptions[$select.val()];
                if (!f) return;

                loadFilterString(f.filterString);
                $modalName.val(f.name);
                $modalDescription.val(f.description);

                // Resets to the placeholder — a one-shot pick, not a
                // persistent "this is what's loaded" indicator, so leaving
                // it selected would be misleading once the tree moves on
                // from here (e.g. the user then edits a rule).
                $select.val('');
            });
        }

        // FilterModel.parse() throws on malformed/unsupported filter strings
        // — shouldn't happen for anything saved through this UI, but a
        // filter created elsewhere (or hand-edited) could still trip it.
        function loadFilterString(filterString) {
            try {
                tree.load(filterString);
                return true;
            } catch (e) {
                $.dashToast({ message: 'Could not load this filter', state: 'error', body: e.message });
                return false;
            }
        }

        // Toggles Bootstrap's inline invalid-field styling — empty message
        // clears it. Also cleared as soon as the user edits the name again,
        // so a stale error doesn't linger once they've acted on it. Scrolls
        // into view since the name field can be below the fold on a long
        // tree, inside the modal's scrollable body.
        function setNameError(message) {
            $modalName.toggleClass('is-invalid', !!message);
            $modalNameError.text(message || '');
            if (message) $modalName.get(0).scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        $modalName.on('input', function () { setNameError(''); });

        // Lives just above the name/description fields, inside the modal's
        // scrollable body (modal-dialog-scrollable) — scrolled into view for
        // the same reason as setNameError above.
        function setDuplicateWarning(message) {
            $modalDuplicateWarning.toggleClass('d-none', !message).text(message || '');
            if (message) $modalDuplicateWarning.get(0).scrollIntoView({ block: 'center', behavior: 'smooth' });
        }

        function showIncompleteWarning() {
            $modalIncompleteWarning.removeClass('d-none');
            $modalIncompleteWarning.get(0).scrollIntoView({ block: 'center', behavior: 'smooth' });
        }

        // Shared save path — validates name + rule completeness, then
        // upserts via $.dashESFilters.save(). Used by manage mode's
        // Save/Update/Save as new AND apply mode's "Apply and Save".
        // Surfaces its own inline warnings; rejects silently (no unhandled-
        // rejection console noise) on both local validation failure and a
        // duplicate — callers just chain .then() for the success path.
        function validateAndSave(record) {
            setDuplicateWarning('');
            $modalIncompleteWarning.addClass('d-none');

            var name = $modalName.val().trim();

            if (!name) {
                setNameError('Please enter a name for this filter.');
                return $.Deferred().reject().promise();
            }

            if (!tree.isValid()) {
                showIncompleteWarning();
                return $.Deferred().reject().promise();
            }

            record.name = name;
            record.description = $modalDescription.val().trim();
            record.filterString = tree.serialize();

            return $.dashESFilters.save(record).catch(function (err) {
                if (err && err.reason === 'duplicate') {
                    if (err.match.nameMatches) {
                        setNameError('A filter named "' + err.match.name + '" already exists.');
                    }
                    if (err.match.stringMatches) {
                        setDuplicateWarning('These exact rules already match "' + err.match.name + '" — give this one different rules, or use that one instead.');
                    }
                }
                return $.Deferred().reject(err).promise();
            });
        }

        // -- Manage mode: Save (add) / Update + Save as new (edit) --------------

        // `filter` is null for a blank "Add new filter"; otherwise it's what
        // gets loaded into the tree — for 'edit' this also makes Update
        // available (upserts filter.id in place), Save as new never does.
        function openManage(filter, addOrEdit) {
            ensureTreeReady();
            setNameError('');
            setDuplicateWarning('');
            $modalIncompleteWarning.addClass('d-none');

            FilterFields.ready.then(function () {
                if (filter) {
                    if (!loadFilterString(filter.filterString)) return;
                } else {
                    tree.clear();
                }

                $modalName.val(filter ? filter.name : '');
                $modalDescription.val(filter ? filter.description : '');
                $filterModal.find('.esf-filter-modal-title').text(addOrEdit === 'edit' ? 'Edit Filter' : 'Add Filter');

                var editing = addOrEdit === 'edit' && filter && filter.id;
                $modalSaveBtn.toggleClass('d-none', !!editing);
                $modalUpdateBtn.toggleClass('d-none', !editing);
                $modalSaveAsNewBtn.toggleClass('d-none', !editing);

                // Rebound on every open — each needs the *current* filter/id
                // in its closure, not whichever was open last time.
                $modalSaveBtn.off('click').on('click', function () {
                    validateAndSave({}).then(function () { modalHide($filterModal); }).catch(function () {});
                });
                $modalSaveAsNewBtn.off('click').on('click', function () {
                    validateAndSave({}).then(function () { modalHide($filterModal); }).catch(function () {});
                });
                $modalUpdateBtn.off('click').on('click', function () {
                    validateAndSave({ id: filter.id }).then(function () { modalHide($filterModal); }).catch(function () {});
                });
                if (editing) $modalUpdateBtn.text('Update ‘' + filter.name + '’');

                modalShow($filterModal);
            });
        }

        // -- Apply mode: Apply / Apply and Save ----------------------------------

        function openApply(config) {
            config = config || {};
            ensureTreeReady();
            setNameError('');
            setDuplicateWarning('');
            $modalIncompleteWarning.addClass('d-none');
            $modalName.val('');
            $modalDescription.val('');

            FilterFields.ready.then(function () {
                if (config.value) {
                    if (!loadFilterString(config.value)) return;
                } else {
                    tree.clear();
                }

                $filterModal.find('.esf-filter-modal-title').text(config.value ? 'Edit Filter' : 'Add Filter');

                $modalApplyBtn.off('click').on('click', function () {
                    $modalIncompleteWarning.addClass('d-none');
                    if (!tree.isValid()) {
                        showIncompleteWarning();
                        return;
                    }
                    var filterString = tree.serialize();
                    // No real name here (Apply doesn't require one) — a
                    // readable rule summary instead of the raw j|{...}
                    // string, which is what the caller's component:addItem
                    // would otherwise fall back to showing as the chip label.
                    var description = tree.describe();
                    modalHide($filterModal);
                    if (config.onApply) config.onApply(filterString, description);
                });

                $modalApplySaveBtn.off('click').on('click', function () {
                    validateAndSave({}).then(function (saved) {
                        modalHide($filterModal);
                        if (config.onApplyAndSave) config.onApplyAndSave(saved.filterString, saved.name);
                    }).catch(function () {});
                });

                modalShow($filterModal);
            });
        }

        return {
            openManage: openManage,
            openApply: openApply,
        };
    }
})(jQuery);
