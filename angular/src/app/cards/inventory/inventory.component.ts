import { Component, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MdDialog } from '@angular/material';
import { DomSanitizer } from '@angular/platform-browser';
import { CardComponent } from '../_base/card.component';
import { inventoryService } from './inventory.service';
import { ManifestService } from '../../bungie/manifest/manifest.service';
import { SharedBungie } from '../../bungie/shared-bungie.service';
import { SharedApp } from '../../shared/services/shared-app.service';
import { FiltersDialog } from './filters-dialog/filters-dialog.component';

import { ISubNavItem, IToolbarItem } from '../../nav/nav.interface';
import { AccountSummaryService } from 'app/bungie/services/service.barrel';
import { DestinyMembership, InventoryBucket, InventoryItem, IAccountSummary, IVaultSummary, SummaryCharacter } from 'app/bungie/services/interface.barrel';

import { expandInShrinkOut, fadeInFromBottom } from '../../shared/animations';
import { debounceBy, delayBy } from '../../shared/decorators';
import { InventoryUtils } from './inventory-utils';

@Component({
    selector: 'dd-inventory',
    templateUrl: './inventory.component.html',
    styleUrls: ['../_base/card.component.scss', './inventory.component.scss'],
    animations: [expandInShrinkOut(), fadeInFromBottom()],
    providers: [inventoryService]
})

export class ItemManagerComponent extends CardComponent {
    CARD_DEFINITION_ID = 6;

    // Get the selected membership (Xbox, PSN, Blizzard)
    private selectedMembership: DestinyMembership;

    // Account summary so we can get the characters associated to this account
    accountSummary: IAccountSummary;

    // Map of vault bucket data <bucketHash, bucket>
    private vaultBucketsMap: Map<number, InventoryBucket>;

    // Array of vault buckets for display in .html
    vaultBucketsArray: Array<InventoryBucket> = new Array<InventoryBucket>();

    // Array of Map of <bucketHash, bucket>. Array position matches caracter position in this.accountSummary.characters
    private charactersBucketsMap: Array<Map<number, InventoryBucket>>;

    // Array of character buckets for display in .html. Array position matches caracter position in this.accountSummary.characters. Character[Buckets]
    charactersBucketsArray: Array<Array<InventoryBucket>> = new Array<Array<InventoryBucket>>();

    // Inception level 4. Character[BucketGroup[Buckets]]
    charactersBucketsGroupsArray: Array<Array<Array<InventoryBucket>>>;

    // Tower definition from the manifest so we can have the icon
    towerDefinition: any;

    // Keep track if a user has collapsed a section
    collapsedSections: Array<boolean>;

    // If user has long pressed an inventory item, we are in edit mode
    editMode: boolean = false;

    selectedInventoryItems: Array<InventoryItem>;

    // Filtering
    searchText: string = '';
    showInventoryGroups: Array<boolean>;

    constructor(private accountSummaryService: AccountSummaryService, private activatedRoute: ActivatedRoute, public domSanitizer: DomSanitizer,
        private inventoryService: inventoryService, private mdDialog: MdDialog, private manifestService: ManifestService,
        private sharedBungie: SharedBungie, public sharedApp: SharedApp) {
        super(sharedApp);
    }

    ngOnInit() {
        super.ngOnInit();

        // Get localStorage variables
        this.collapsedSections = this.getCardLocalStorageAsJsonObject("collapsedSections", [false, false, false, false]);
        this.showInventoryGroups = this.getCardLocalStorageAsJsonObject("showInventoryGroups", [false, true, true, false, true, true, true, false, false, true]);

        // Get tower definition so we can show the tower emblem
        this.towerDefinition = this.manifestService.getManifestEntry("DestinyActivityDefinition", 1522220810);

        // Set our membership (XBL, PSN, Blizzard)
        this.selectedMembership = this.sharedBungie.destinyMemberships[this.sharedApp.userPreferences.membershipIndex];

        this.getFullInventory();

        if (this.isFullscreen) {
            this.setSubNavItems();
            this.sharedApp.showInfoOnce("Press and hold an item to enter edit mode.");
        }
    }

    private getFullInventory() {
        // Get Account Summary to get the list of available characters
        this.accountSummaryService.getAccountSummary(this.selectedMembership).then((accountSummary: IAccountSummary) => {
            this.accountSummary = accountSummary;
            this.accountSummary.characters.forEach((character: SummaryCharacter) => {
                // Set the manifest values for the characters
                character.characterBase.classValue = this.manifestService.getManifestEntry("DestinyClassDefinition", character.characterBase.classHash);
                character.characterBase.genderValue = this.manifestService.getManifestEntry("DestinyGenderDefinition", character.characterBase.genderHash);
                character.characterBase.raceValue = this.manifestService.getManifestEntry("DestinyRaceDefinition", character.characterBase.raceHash);
            });

            // Fetch the inventory
            this.inventoryService.getFullInventory(this.selectedMembership, this.accountSummary).then((inventoryResponses) => {
                // Vault is the first response
                let vaultSummaryResponse: IVaultSummary = inventoryResponses.shift();

                // Populate vault buckets
                this.vaultBucketsMap = new Map<number, InventoryBucket>();
                this.vaultBucketsArray = new Array<InventoryBucket>();
                InventoryUtils.populateBucketMapFromResponse(-1, this.manifestService, vaultSummaryResponse.items, this.vaultBucketsMap);
                InventoryUtils.flattenInventoryBuckets(this.vaultBucketsMap, this.vaultBucketsArray);

                // Init the array for the character buckets map and bucketsGroupArray. Should be the same size as the number of characters we have.
                this.charactersBucketsMap = new Array<Map<number, InventoryBucket>>(inventoryResponses.length);

                this.charactersBucketsGroupsArray = new Array<Array<Array<InventoryBucket>>>(inventoryResponses.length);
                // All remaining responses should be characters
                for (let i = 0; i < inventoryResponses.length; i++) {
                    this.charactersBucketsMap[i] = new Map<number, InventoryBucket>();
                    this.charactersBucketsArray[i] = new Array<InventoryBucket>();
                    InventoryUtils.populateBucketMapFromResponse(i, this.manifestService, inventoryResponses[i].items, this.charactersBucketsMap[i]);
                    InventoryUtils.flattenInventoryBuckets(this.charactersBucketsMap[i], this.charactersBucketsArray[i]);

                    // Group character buckets in to separate arrays based on their category id
                    InventoryUtils.groupCharactersBuckets(this.charactersBucketsGroupsArray, this.charactersBucketsArray[i], i);
                }

                this.applyFilter();
            }).catch((error) => {
                this.sharedApp.showError("There was an error getting the inventory.", error);
            });

        }).catch(error => {
            this.sharedApp.showError("There was an error getting the account summary.", error);
        });
    }

    refreshCharacter(characterIndex: number) {
        let character: SummaryCharacter = this.accountSummary.characters[characterIndex];

        this.inventoryService.clearCharacterInventoryCache(this.selectedMembership, character.characterBase.characterId);
        this.inventoryService.getCharacterInventory(this.selectedMembership, character.characterBase.characterId).then((inventoryResponse) => {
            this.charactersBucketsMap[characterIndex] = new Map<number, InventoryBucket>();
            this.charactersBucketsArray[characterIndex] = new Array<InventoryBucket>();
            InventoryUtils.populateBucketMapFromResponse(characterIndex, this.manifestService, inventoryResponse.items, this.charactersBucketsMap[characterIndex]);
            InventoryUtils.flattenInventoryBuckets(this.charactersBucketsMap[characterIndex], this.charactersBucketsArray[characterIndex]);
            InventoryUtils.groupCharactersBuckets(this.charactersBucketsGroupsArray, this.charactersBucketsArray[characterIndex], characterIndex);
            this.applyFilter();
        });
    }

    refreshVault() {
        this.inventoryService.clearVaultInventoryCache(this.selectedMembership);
        this.inventoryService.getVaultInventory(this.selectedMembership).then((vaultSummaryResponse: IVaultSummary) => {
            // Populate vault buckets
            this.vaultBucketsMap = new Map<number, InventoryBucket>();
            this.vaultBucketsArray = new Array<InventoryBucket>();
            InventoryUtils.populateBucketMapFromResponse(-1, this.manifestService, vaultSummaryResponse.items, this.vaultBucketsMap);
            InventoryUtils.flattenInventoryBuckets(this.vaultBucketsMap, this.vaultBucketsArray);
            this.applyFilter();
        });
    }

    searchTextChanged(newSearchText: string) {
        let characterAddedToEnd: boolean = false;
        if (newSearchText.length - 1 == this.searchText.length && newSearchText.startsWith(this.searchText))
            characterAddedToEnd = true;

        this.searchText = newSearchText;
        this.applyFilter(characterAddedToEnd);
    }

    @debounceBy(400)
    applyFilter(skipAlreadyFiltered: boolean = false) {
        // Apply filter to vault bucket
        for (let i = 0; i < this.vaultBucketsArray.length; i++)
            InventoryUtils.applyFilterToBucket(this.searchText, this.showInventoryGroups, this.vaultBucketsArray[i], skipAlreadyFiltered);

        // Apply filter to each characters bucket groups
        for (let characterIndex = 0; characterIndex < this.charactersBucketsGroupsArray.length; characterIndex++) {
            // Bucket groups for character
            let bucketGroups = this.charactersBucketsGroupsArray[characterIndex];

            for (let groupIndex = 0; groupIndex < bucketGroups.length; groupIndex++) {
                let buckets = this.charactersBucketsGroupsArray[characterIndex][groupIndex];

                for (let i = 0; i < buckets.length; i++)
                    InventoryUtils.applyFilterToBucket(this.searchText, this.showInventoryGroups, buckets[i], skipAlreadyFiltered);
            }
        }
    }

    collapseSection(sectionIndex: number) {
        this.collapsedSections[sectionIndex] = !this.collapsedSections[sectionIndex];
        this.setCardLocalStorage("collapsedSections", JSON.stringify(this.collapsedSections));
    }

    inventoryItemLongPress(inventoryItem: InventoryItem) {
        if (!this.editMode)
            this.setEditMode(true);

        this.inventoryItemClicked(inventoryItem);
    }

    inventoryItemClicked(inventoryItem: InventoryItem) {
        if (inventoryItem.transferStatus == 2 || inventoryItem.transferStatus == 3)
            return;

        if (this.editMode) {
            inventoryItem.selected = !inventoryItem.selected;
            if (inventoryItem.selected)
                this.selectedInventoryItems.push(inventoryItem);
            else {
                // If deselected, remove from selected array
                this.selectedInventoryItems.splice(this.selectedInventoryItems.indexOf(inventoryItem), 1);

                // If deselecting last item, turn off edit mode
                if (this.selectedInventoryItems.length == 0)
                    this.setEditMode(false);
            }
        }
    }

    setEditMode(editOn: boolean) {
        this.editMode = editOn;

        // Deselect all inventory items if we're coming out of edit mode
        if (!this.editMode)
            this.selectedInventoryItems.forEach(selectedInventoryItem => { selectedInventoryItem.selected = false; });

        this.selectedInventoryItems = new Array<InventoryItem>();
    }

    @delayBy(100)
    setSubNavItems() {
        this.sharedApp.subNavItems = new Array<ISubNavItem>();

        this.sharedApp.subNavItems.push({
            title: 'Manage Loadouts', materialIcon: 'library_add',
            selectedCallback: (subNavItem: ISubNavItem) => {
            }
        });

        this.sharedApp.subNavItems.push({ title: '_spacer', materialIcon: '' });

        this.sharedApp.subNavItems.push({
            title: 'Filters', materialIcon: 'filter_list',
            selectedCallback: (subNavItem: ISubNavItem) => {
                let dialogRef = this.mdDialog.open(FiltersDialog);
                dialogRef.componentInstance.showInventoryGroups = this.showInventoryGroups;
                dialogRef.afterClosed().subscribe((result: string) => {
                    this.setCardLocalStorage("showInventoryGroups", JSON.stringify(this.showInventoryGroups));
                    this.applyFilter();
                });
            }
        });

        // Show list of loadouts

    }

    transferSelectedItemsToCharacterIndex(destCharacterIndex: number) {
        var shouldRefreshDestCharacter: boolean = false;
        for (let i = 0; i < this.selectedInventoryItems.length; i++) {
            let inventoryItem = this.selectedInventoryItems[i];
            // Don't transfer things that already exist in their destination
            if (inventoryItem.characterIndex == destCharacterIndex)
                continue;

            // Insert the item in to the destinationArray
            if (!InventoryUtils.transferItemToCharacter(this.charactersBucketsMap, this.manifestService, inventoryItem, destCharacterIndex))
                shouldRefreshDestCharacter = true;
        }

        if (shouldRefreshDestCharacter)
            this.refreshCharacter(destCharacterIndex);

        this.setEditMode(false);
    }
}
