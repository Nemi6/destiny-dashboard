import { Component, ViewChild } from '@angular/core';
import { MdTabGroup } from '@angular/material';
import { CardComponent } from '../_base/card.component';
import { SharedApp } from 'app/shared/services/shared-app.service';
import { ManifestService } from 'app/bungie/manifest/manifest.service';
import { AccountStatsService, AccountSummaryService, CharacterStatsService } from 'app/bungie/services/service.barrel';

import { GroupTypes, ModeTypes, PeriodTypes } from 'app/bungie/services/enums.interface';
import { DestinyMembership, IAccountStats, IAccountSummary, ICharacterStats, SummaryCharacter } from 'app/bungie/services/interface.barrel';

@Component({
  selector: 'dd-stats',
  templateUrl: './stats.component.html',
  styleUrls: ['../_base/card.component.scss', './stats.component.scss']
})
export class StatsComponent extends CardComponent {
  CARD_DEFINITION_ID = 1;

  @ViewChild("tabGroup")
  tabGroup: MdTabGroup;

  selectedTabIndex: number = 0;

  // Current membership
  selectedMembership: DestinyMembership;

  // Overall account stats
  accountStats: IAccountStats;
  accountStatsWeapons: Array<{ displayName: string, value: string }>;

  // Account summary with characters
  accountSummary: IAccountSummary;

  // Stats for selected character
  characterStats: ICharacterStats;


  constructor(private accountStatsService: AccountStatsService, private accountSummaryService: AccountSummaryService, private characterStatsService: CharacterStatsService,
    private manifestService: ManifestService, public sharedApp: SharedApp) {
    super(sharedApp);
  }

  ngOnInit() {
    super.ngOnInit();

    //Load previously selected tab index
    this.selectedTabIndex = +this.getCardLocalStorage("selectedTabIndex", 0);
  }

  ngOnDestroy() {
    super.ngOnDestroy();
  }

  membershipSelected(selectedMembership: DestinyMembership) {
    this.selectedMembership = selectedMembership;

    //Get Account Summary to get the list of available characters
    this.accountSummaryService.getAccountSummary(this.selectedMembership).then((accountSummary: IAccountSummary) => {
      this.accountSummary = accountSummary;
      this.accountSummary.characters.forEach((character: SummaryCharacter) => {
        character.characterBase.classValue = this.manifestService.getManifestEntry("DestinyClassDefinition", character.characterBase.classHash);
        character.characterBase.genderValue = this.manifestService.getManifestEntry("DestinyGenderDefinition", character.characterBase.genderHash);
        character.characterBase.raceValue = this.manifestService.getManifestEntry("DestinyRaceDefinition", character.characterBase.raceHash);
      });

      if (this.selectedTabIndex > this.accountSummary.characters.length - 1)
        this.selectedTabIndex = 0;

      this.tabGroup.selectedIndex = this.selectedTabIndex;
      this.selectedTabIndexChanged(this.selectedTabIndex);
    });
  }

  selectedTabIndexChanged(targetCharacterIndex: number) {
    //Set new character tab index
    this.selectedTabIndex = targetCharacterIndex;

    //Save the selected tab index
    this.setCardLocalStorage("selectedTabIndex", this.selectedTabIndex);

    //Get data for the newly selected character
    this.getSelectedStats();
  }

  getSelectedStats() {
    // Index 0 is the summary information.Characters are index 1- 3
    if (this.selectedTabIndex == 0) {
      // Get a summary of the account statistics
      this.accountStatsService.getAccountStats(this.selectedMembership, [GroupTypes.GENERAL, GroupTypes.WEAPONS]).then((accountStats: IAccountStats) => {
        this.accountStats = accountStats;
        this.setAccountStatsWeapons();
      });
    }
    else {
      let characterId: string = this.accountSummary.characters[this.selectedTabIndex - 1].characterBase.characterId;
      this.characterStatsService.getCharacterStats(this.selectedMembership, characterId, [GroupTypes.GENERAL], [ModeTypes.ALLPVE, ModeTypes.ALLPVP], PeriodTypes.ALLTIME).then((characterStats: ICharacterStats) => {
        this.characterStats = characterStats;
      });
    }
  }

  private setAccountStatsWeapons() {
    // Create an array of account weapon stats so we can sort by value 
    this.accountStatsWeapons = new Array<{ displayName: string, value: string }>();

    // Create an alias for this long nammed variable
    let PvEAllTime = this.accountStats.mergedAllCharacters.results.allPvE.allTime;
    this.accountStatsWeapons.push({ displayName: "Auto Rifle Kills", value: PvEAllTime.weaponKillsAutoRifle.basic.displayValue });
    this.accountStatsWeapons.push({ displayName: "Fusion Rifle Kills", value: PvEAllTime.weaponKillsFusionRifle.basic.displayValue });
    this.accountStatsWeapons.push({ displayName: "Grenade Kills", value: PvEAllTime.weaponKillsGrenade.basic.displayValue });
    this.accountStatsWeapons.push({ displayName: "Hand Cannon Kills", value: PvEAllTime.weaponKillsHandCannon.basic.displayValue });
    this.accountStatsWeapons.push({ displayName: "Machine Gun Kills", value: PvEAllTime.weaponKillsMachinegun.basic.displayValue });
    this.accountStatsWeapons.push({ displayName: "Pulse Rifle Kills", value: PvEAllTime.weaponKillsPulseRifle.basic.displayValue });
    this.accountStatsWeapons.push({ displayName: "Relic Kills", value: PvEAllTime.weaponKillsRelic.basic.displayValue });
    this.accountStatsWeapons.push({ displayName: "Rocket Kills", value: PvEAllTime.weaponKillsRocketLauncher.basic.displayValue });
    this.accountStatsWeapons.push({ displayName: "Scout Rifle Kills", value: PvEAllTime.weaponKillsScoutRifle.basic.displayValue });
    this.accountStatsWeapons.push({ displayName: "Shotgun Kills", value: PvEAllTime.weaponKillsShotgun.basic.displayValue });
    this.accountStatsWeapons.push({ displayName: "Sidearm Kills", value: PvEAllTime.weaponKillsSideArm.basic.displayValue });
    this.accountStatsWeapons.push({ displayName: "SMG Kills", value: PvEAllTime.weaponKillsSubmachinegun.basic.displayValue });
    this.accountStatsWeapons.push({ displayName: "Sniper Kills", value: PvEAllTime.weaponKillsSniper.basic.displayValue });
    this.accountStatsWeapons.push({ displayName: "Super Kills", value: PvEAllTime.weaponKillsSuper.basic.displayValue });
    this.accountStatsWeapons.push({ displayName: "Sword Kills", value: PvEAllTime.weaponKillsSword.basic.displayValue });
    this.accountStatsWeapons.sort((a, b) => {
      let aNum = parseInt(a.value);
      let bNum = parseInt(b.value);
      if (isNaN(aNum)) aNum = 0;
      if (isNaN(bNum)) bNum = 0;
      return bNum - aNum;
    });
  }
}
