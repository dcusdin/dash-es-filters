
<div class="d-flex justify-content-end mb-3">
    <button type="button" class="btn btn-primary esf-add-filter-btn"><i class="fa fa-plus"></i> Add new filter</button>
</div>

<div class="form-group mb-4">
    <h3>Preset Filters</h3>
    <ul class="esf-presets-list list-group">
        <li class="text-muted small d-block">
            <div class="spinner-border spinner-border-sm mr-2" role="status">
                <span class="sr-only">Loading...</span>
            </div>
            Loading preset filters…
        </li>
    </ul>
</div>
<hr>
<div class="form-group">
    <h3>Your Filters</h3>


    <ul class="esf-saved-list list-group">
        <li class="text-muted small d-block">
            <div class="spinner-border spinner-border-sm mr-2" role="status">
                <span class="sr-only">Loading...</span>
            </div>
            Loading your filters…
        </li>
    </ul>
    <p class="esf-saved-empty text-muted small d-none">You don't have any saved filters yet — click "Add new filter" above to create one.</p>
    <p class="esf-saved-disabled text-muted small d-none">Custom filter saving isn't available on this site.</p>
</div>

<!-- Shared by both Preset and Custom rows. Copy (instant duplicate, no
     modal — saves as "Copy of X") is available on both. Edit and Delete
     are both hidden for a Preset row — nothing of yours to edit in place
     or delete; Copy is the only way to start something of your own from it. -->
<template id="esf-filter-row-item-template">
    <li class="list-group-item list-group-item-action">
        <div class="form-row">
            <div class="col-lg-9 col-xl-10">
                <div><strong class="esf-filter-name"></strong></div>
                <div class="esf-filter-description text-muted small"></div>
                <div class="overflow-hidden w-100">
                    <code class="esf-filter-string small text-muted d-block text-truncate mt-2"></code>
                </div>
            </div>
            <div class="col-lg-3 col-xl-2 d-flex">
                <div class="button-group ml-lg-auto mt-2">
                    <button type="button" class="esf-filter-copy btn btn-sm" title="Copy"><i class="fa fa-copy"></i></button>
                    <button type="button" class="esf-filter-edit btn btn-sm" title="Edit"><i class="fa fa-edit"></i></button>
                    <button type="button" class="esf-filter-delete btn btn-sm text-danger" title="Delete"><i class="fa fa-trash"></i></button>
                </div>
            </div>
        </div>
    </li>
</template>

<!-- Both cloned into <body> once, then shown/hidden via native DOM clicks —
     see manager.php's modalShow()/modalHide() for why (Bootstrap's own
     $.fn.modal isn't usable here; the theme bundles its own isolated
     jQuery+Bootstrap instance via webpack). -->
<template id="esf-filter-modal-template">
    <?php include __DIR__ . '/filter-modal.php'; ?>
</template>

<template id="esf-delete-filter-modal-template">
    <?php include __DIR__ . '/delete-filter-modal.php'; ?>
</template>
