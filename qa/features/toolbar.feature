Feature: The toolbar says what Detour will do
  The toolbar answers for the page in front of the reader. Its mark says whether
  Detour will stop that page, before the reader opens the popup, and its title
  names the outcome. A block page answers for the article that it stopped.

  Background:
    Given Detour is enabled
    And the stored list names cnet.com with an ad-blocker wall that stops a page
    And the reader holds no allowance for the site

  @unit
  Scenario: A page that Detour will stop carries the coloured mark
    When the reader opens a cnet.com article
    Then the toolbar carries the coloured mark
    And its title says "Detour will stop this page on cnet.com"

  @unit
  Scenario: A page that the list does not carry keeps the mark faint
    When the reader opens an example.com page
    Then the toolbar carries the faint mark
    And its title reads "Detour"

  @unit
  Scenario: A listed page whose walls are all switched off keeps the mark faint
    Given the reader has switched every ad-blocker wall off in the settings
    When the reader opens the cnet.com article
    Then the toolbar carries the faint mark
    And its title says "Detour will not stop this page on cnet.com"

  @unit
  Scenario: A listed site that the reader allowed keeps the mark faint
    Given the reader chose "This site always" on a block page for cnet.com
    When the reader opens another cnet.com article
    Then the toolbar carries the faint mark
    And its title says "Detour will not stop this page on cnet.com"

  @unit
  Scenario: A block page answers for the article that it stopped
    When the reader opens a cnet.com article and the tab moves to the block page
    Then the toolbar carries the coloured mark
    And its title says "Detour will stop this page on cnet.com"

  @unit
  Scenario: A block page without a record of a stop keeps the mark faint
    Given the worker holds no record of a stop for this tab
    When the reader opens the block page for a cnet.com article
    Then the toolbar carries the faint mark
    And its title reads "Detour"

  @unit
  Scenario: A Detour that is off carries the gray mark
    Given the switch in the popup is off
    When the reader opens the cnet.com article
    Then the toolbar carries the gray mark
    And its title reads "Detour is off"

  @unit
  Scenario: The toolbar never shows a badge
    When the reader opens a cnet.com article
    Then the toolbar shows no badge text
    And the mark alone says whether a detour exists

  @manual @visual
  Scenario: The toolbar mark reads at the size of the toolbar
    When the reader loads the extension and pins the icon on a light and on a dark toolbar
    Then each mark is visible on its toolbar
    And the coloured mark is distinguishable from the faint mark at 16 px
