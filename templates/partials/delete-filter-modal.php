<!--
    Wrapped in a <template> and cloned into <body> by manager.php's
    cloneModal() — same pattern as filter-modal.php. Replaces the plain
    window.confirm() the Delete button used to use; wired via
    manager.php's confirmDeleteFilter().
-->
<div class="modal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete Filter</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>

            <div class="modal-body">
                <p>Delete "<strong class="esf-delete-filter-name"></strong>"? This can't be undone.</p>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn btn-link" data-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-danger esf-delete-confirm-btn">Delete</button>
            </div>
        </div>
    </div>
</div>
