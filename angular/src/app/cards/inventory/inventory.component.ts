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

    // Array of Map of <bucketHash, bucket>. Array position matches caracter position in this.accountSummary.characters. Vault is always [3]
    private bucketsMap: Array<Map<number, InventoryBucket>> = new Array<Map<number, InventoryBucket>>(4);

    // Array of character buckets for display in .html. Array position matches caracter position in this.accountSummary.characters. Character[Buckets]
    bucketsArray: Array<Array<InventoryBucket>> = new Array<Array<InventoryBucket>>(4);

    // Only character buckets get grouped. Character[BucketGroup[Buckets]]
    bucketGroupsArray: Array<Array<Array<InventoryBucket>>> = new Array<Array<Array<InventoryBucket>>>(4);

    // Tower definition from the manifest so we can have the icon
    towerDefinition: any;

    // Keep track if a user has collapsed a section
    expandedSections: Array<boolean>;

    // If user has long pressed an inventory item, we are in edit mode
    editMode: boolean = false;

    // Array of selected inventory items
    selectedInventoryItems: Array<InventoryItem>;

    // Filtering
    searchText: string = '';
    showInventoryGroups: Array<boolean>;

    constructor(private accountSummaryService: AccountSummaryService, private activatedRoute: ActivatedRoute, public domSanitizer: DomSanitizer,
        private inventoryService: inventoryService, private mdDialog: MdDialog, private manifestService: ManifestService,
        private sharedBungie: SharedBungie, public sharedApp: SharedApp) {
        super(sharedApp);
        if (this.isFullscreen) {
            this.setSubNavItems();
            this.sharedApp.showInfoOnce("Press and hold an item to enter edit mode.");
        }
    }

    ngOnInit() {
        super.ngOnInit();

        // Get localStorage variables
        if (this.isFullscreen)
            this.expandedSections = this.getCardLocalStorageAsJsonObject("expandedSections", [false, false, false, false]);
        this.showInventoryGroups = this.getCardLocalStorageAsJsonObject("showInventoryGroups", [false, true, true, false, true, true, true, false, false, true]);

        // Get tower definition so we can show the tower emblem
        this.towerDefinition = this.manifestService.getManifestEntry("DestinyActivityDefinition", 1522220810);

        // Set our membership (XBL, PSN, Blizzard)
        this.selectedMembership = this.sharedBungie.destinyMemberships[this.sharedApp.userPreferences.membershipIndex];

        this.getFullInventory();
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


            // Init buckets
            this.bucketGroupsArray = new Array<Array<Array<InventoryBucket>>>(4);
            this.bucketsMap = new Array<Map<number, InventoryBucket>>(4);

            // Load character data
            var inventoryPromises = new Array<Promise<any>>();
            for (let i = 0; i < this.accountSummary.characters.length; i++)
                inventoryPromises.push(this.loadCharacterInventory(i));

            inventoryPromises.push(this.loadVaultInventory());

            Promise.all(inventoryPromises).then(() => {
                this.applyFilter();
            });

        }).catch(error => {
            this.sharedApp.showError("There was an error getting the account summary.", error);
        });
    }

    refreshCharacterInventory(characterIndex: number) {
        this.loadCharacterInventory(characterIndex).then(() => {
            let bucketGroups = this.bucketGroupsArray[characterIndex];
            InventoryUtils.applyFilterToBucketGroups(this.searchText, this.showInventoryGroups, bucketGroups, false);
        });
    }

    refreshVaultInventory(characterIndex: number) {
        this.loadVaultInventory().then(() => {
            let bucketGroups = this.bucketGroupsArray[3];
            InventoryUtils.applyFilterToBucketGroups(this.searchText, this.showInventoryGroups, bucketGroups, false);
        });
    }

    loadCharacterInventory(characterIndex: number): Promise<any> {
        let character: SummaryCharacter = this.accountSummary.characters[characterIndex];
        this.inventoryService.clearCharacterInventoryCache(this.selectedMembership, character.characterBase.characterId);
        return this.inventoryService.getCharacterInventory(this.selectedMembership, character.characterBase.characterId).then((inventoryResponse) => {
            this.populateBuckets(characterIndex, inventoryResponse.items);
        });
    }

    loadVaultInventory(): Promise<any> {
        this.inventoryService.clearVaultInventoryCache(this.selectedMembership);
        return this.inventoryService.getVaultInventory(this.selectedMembership).then((vaultSummaryResponse: IVaultSummary) => {
            this.populateBuckets(3, vaultSummaryResponse.items);
        });
    }

    populateBuckets(bucketIndex: number, responseItems: Array<InventoryItem>) {
        this.bucketsMap[bucketIndex] = new Map<number, InventoryBucket>();
        this.bucketsArray[bucketIndex] = new Array<InventoryBucket>();
        InventoryUtils.populateBucketMapFromResponse(bucketIndex, this.manifestService, responseItems, this.bucketsMap[bucketIndex]);
        InventoryUtils.populateBucketArrayFromMap(this.bucketsMap[bucketIndex], this.bucketsArray[bucketIndex]);
        InventoryUtils.groupBuckets(this.bucketGroupsArray, this.bucketsArray[bucketIndex], bucketIndex);
    }

    searchTextChanged(newSearchText: string) {
        let charAddedToEnd: boolean = false;
        if (newSearchText.length - 1 == this.searchText.length && newSearchText.startsWith(this.searchText))
            charAddedToEnd = true;

        this.searchText = newSearchText;
        this.applyFilter(charAddedToEnd);
    }

    applyFilter(skipAlreadyFiltered: boolean = false) {
        // Apply filter to each characters bucket groups
        for (let characterIndex = 0; characterIndex < this.accountSummary.characters.length; characterIndex++) {
            // Bucket groups for character
            let bucketGroups = this.bucketGroupsArray[characterIndex];
            InventoryUtils.applyFilterToBucketGroups(this.searchText, this.showInventoryGroups, bucketGroups, skipAlreadyFiltered);
        }

        // Apply filter to vault buckets
        InventoryUtils.applyFilterToBucketGroups(this.searchText, this.showInventoryGroups, this.bucketGroupsArray[3], skipAlreadyFiltered);
    }

    collapseSection(sectionIndex: number) {
        // If we're in card mode, treat expandable sections as accordions
        if (!this.isFullscreen)
            for (let i = 0; i < this.expandedSections.length; i++) {
                if (i == sectionIndex) continue;
                this.expandedSections[i] = false;
            }

        this.expandedSections[sectionIndex] = !this.expandedSections[sectionIndex];
        if (this.isFullscreen)
            this.setCardLocalStorage("expandedSections", JSON.stringify(this.expandedSections));
    }

    inventoryItemLongPress(inventoryItem: InventoryItem) {
        if (inventoryItem.itemValue.nonTransferrable) {
            this.sharedApp.showWarning("This item is not transferrable.", { timeOut: 1500, progressBar: false });
            return;
        }

        if (!this.editMode)
            this.setEditMode(true);

        this.inventoryItemClicked(inventoryItem);
    }

    inventoryItemClicked(inventoryItem: InventoryItem) {
        if (inventoryItem.itemValue.nonTransferrable) {
            this.sharedApp.showWarning("This item is not transferrable.", { timeOut: 1500, progressBar: false });
            return;
        }

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

    setSubNavItems() {
        this.sharedApp.subNavItems = new Array<ISubNavItem>();

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

        this.sharedApp.subNavItems.push({ title: '_spacer', materialIcon: '' });

        this.sharedApp.subNavItems.push({
            title: 'Manage Loadouts', materialIcon: 'library_add',
            selectedCallback: (subNavItem: ISubNavItem) => {
            }
        });

        // Show list of loadouts
    }

    transferSelectedItemsToIndex(destCharacterIndex: number) {
        var shouldRefreshDestCharacter: boolean = false;
        for (let i = 0; i < this.selectedInventoryItems.length; i++) {
            let inventoryItem = this.selectedInventoryItems[i];
            // Don't transfer things that already exist in their destination
            if (inventoryItem.characterIndex == destCharacterIndex)
                continue;

            // Insert the item in to the destinationArray
            if (!InventoryUtils.transferItem(this.bucketsMap, this.manifestService, inventoryItem, destCharacterIndex))
                shouldRefreshDestCharacter = true;
        }

        // If the destination bucket doesn't exist, just reload the destination character (or vault), then filter
        if (shouldRefreshDestCharacter) {
            var refreshPromise = destCharacterIndex == 3 ? this.loadVaultInventory() : this.loadCharacterInventory(destCharacterIndex);
            refreshPromise.then(() => {
                InventoryUtils.applyFilterToBucketGroups(this.searchText, this.showInventoryGroups, this.bucketGroupsArray[destCharacterIndex], false);
            });
        }
        else
            // Otherwise, just filter the destination bucket group
            InventoryUtils.applyFilterToBucketGroups(this.searchText, this.showInventoryGroups, this.bucketGroupsArray[destCharacterIndex], false);

        this.setEditMode(false);
    }
}
