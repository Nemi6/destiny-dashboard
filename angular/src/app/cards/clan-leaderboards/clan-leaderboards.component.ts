import { Component, ViewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { CardComponent } from '../_base/card.component';
import { SharedBungie } from 'app/bungie/shared-bungie.service';
import { SharedApp } from 'app/shared/services/shared-app.service';

import { GetBungieAccountService, ClanLeaderboardsStatsService } from 'app/bungie/services/service.barrel';
import { DestinyMembership, IClanLeaderboardsStats, LbStats, IGetBungieAccount, BungieGroupInfo } from 'app/bungie/services/interface.barrel';

import { fadeIn } from 'app/shared/animations';

@Component({
  selector: 'dd-clan-leaderboards',
  templateUrl: './clan-leaderboards.component.html',
  styleUrls: ['../_base/card.component.scss', './clan-leaderboards.component.scss'],
  animations: [fadeIn()]
})

export class ClanLeaderboardsComponent extends CardComponent {
  CARD_DEFINITION_ID = 7;

  @ViewChild("statGroup")

  // Don't know why this is needed but removing it breaks the platform icon in the view toolbar
  selectedTabIndex: number = 0;

  // Current membership
  selectedMembership: DestinyMembership;

  // Bungie user account
  bungieAccount: IGetBungieAccount;
  bungieAccountRelatedGroups: BungieGroupInfo;

  // Initialize this in case first membership provided has no clan
  bungieClanName = "No Clan Found!";

  // Stat names for data and view Display
  statName: string;
  statDisplayName: string;

  // Clan leaderboard stats
  clanLeaderboardsStats: IClanLeaderboardsStats;
  lbSingleGameKills: LbStats;
  lbSingleGameScore: LbStats;
  lbMostPrecisionKills: LbStats;
  lbLongestKillSpree: LbStats;
  lbLongestSingleLife: LbStats;


  constructor(private getBungieAccountService: GetBungieAccountService, private clanLeaderboardsStatsService: ClanLeaderboardsStatsService, public domSanitizer: DomSanitizer,
    private sharedBungie: SharedBungie, public sharedApp: SharedApp) {
    super(sharedApp);
  }

  ngOnInit() {
    super.ngOnInit();
  }

  ngOnDestroy() {
    super.ngOnDestroy();
  }

  membershipSelected(selectedMembership: DestinyMembership) {
    this.selectedMembership = selectedMembership;

    // Get Bungie account info to retrieve clan groupId
    this.getBungieAccountService.getGetBungieAccount(this.selectedMembership).then((bungieAccount: IGetBungieAccount) => {
      this.bungieAccount = bungieAccount;

      if (this.bungieAccount.clans.length == 0 || this.bungieAccount.clans[0] == null) {
        this.bungieClanName = "No Clan found!";
        this.clanLeaderboardsStats = null;
        console.log("Clans array not found!");
        return;
      }

      if (this.bungieAccount.clans[0].groupId != null) {
        // Call stats function to get leaderboard stats for initial view which is raid stats (modes=4)
        this.statName = "raid";
        this.statDisplayName = "Raid";
        this.getLbStats(4);

        // Set shorter variable name to use in with odd relatedGroups data to get clan name
        let bungieClanGroupId = this.bungieAccount.clans[0].groupId;

        if (this.bungieAccount.relatedGroups[bungieClanGroupId] != null) {
          this.bungieAccountRelatedGroups = bungieAccount.relatedGroups[bungieClanGroupId];

          if (this.bungieAccountRelatedGroups.name != null)
            // Overwrite default with actual clan name
            this.bungieClanName = this.bungieAccountRelatedGroups.name;
        }
      }
    });
  }


  getLbStats(mode: number) {
    // Service accepts an array of modes so put our mode into an array
    let modes = [];
    modes = [mode];


    // Clear stats since some stats are optional for some modes
    //   and we don't want garbage data to be kept by accident
    this.clanLeaderboardsStats = null;
    this.lbSingleGameKills = null;
    this.lbMostPrecisionKills = null;
    this.lbLongestKillSpree = null;
    this.lbLongestSingleLife = null;
    this.lbSingleGameScore = null;

    // Get clan leaderboard stats
    this.clanLeaderboardsStatsService.getClanleaderboardStats(this.bungieAccount.clans[0], modes).then((clanLeaderboardsStats: IClanLeaderboardsStats) => {
      this.clanLeaderboardsStats = clanLeaderboardsStats;

      if (this.clanLeaderboardsStats != null) {

        // Make a simple variable to help with readability in this next block
        let statName = this.clanLeaderboardsStats[this.statName];
        if (statName != null) {
          if (statName.lbSingleGameKills != null)
            this.lbSingleGameKills = statName.lbSingleGameKills;
          if (statName.lbMostPrecisionKills != null)
            this.lbMostPrecisionKills = statName.lbMostPrecisionKills;
          if (statName.lbLongestKillSpree != null)
            this.lbLongestKillSpree = statName.lbLongestKillSpree;
          if (statName.lbLongestSingleLife != null)
            this.lbLongestSingleLife = statName.lbLongestSingleLife;
          if (statName.lbSingleGameScore != null)
            this.lbSingleGameScore = statName.lbSingleGameScore;
        }
      }
    });
  }

  getStatName(modeNumber: number): string {
    // Convert stat mode numbers to mode names for the data call and a people friendly name for the view
    // Keeping options list to six for a mobile friendly option pulldown size
    switch (modeNumber) {
      case 4:
        this.statDisplayName = "Raid";
        this.statName = "raid"
        break;
      case 5:
        this.statDisplayName = "All PvP";
        this.statName = "allPvP";
        break;
      case 7:
        this.statDisplayName = "All PvE";
        this.statName = "allPvE";
        break;
      case 14:
        this.statDisplayName = "Trials Of Osiris";
        this.statName = "trialsOfOsiris";
        break;
      case 16:
        this.statDisplayName = "Nightfall";
        this.statName = "nightfall";
        break;
      case 18:
        this.statDisplayName = "All Strikes";
        this.statName = "allStrikes";
        break;
      default:
        this.statDisplayName = "Not Configured";
        this.statName = "notConfigured";
    }

    return this.statName;
  }

  statsChanged(newMode: number) {
    // Get/set new statName and statDisplayname for view
    this.statName = this.getStatName(newMode);

    // Update stats for new stat selection
    this.getLbStats(newMode);
  }

}
