Feature: The settings page owns the allowances and the reader's choices
  The options page reads storage directly and writes only through a message.
  Every change reaches the service worker, which stores it and repaints the
  toolbar.

  Background:
    Given the reader opened the Detour settings page

  @unit @visual
  Scenario: The page lists every allowance
    Given the reader allowed three sites, each with another scope
    Then the table shows one row per site, with its scope and the date it was added
    And each row carries a remove control whose name names the site
    When the reader removes one row
    Then the site is listed no longer
    And the next visit to that site is stopped again

  @unit @visual
  Scenario: The page says when nothing is allowed
    Then the list reads "No site is allowed."
    And the table adds no empty row

  @unit @visual
  Scenario: The walls table holds one category per row and one type per column
    Then every category has a row and every type has a column
    And a ticked cell is the reader's choice for that wall
    And a metered cell exists only for the paywall row
    And a cell the list cannot hold shows a dashed square that cannot be ticked

  @unit
  Scenario: Switching a wall off lets its pages load
    Given the reader unticks the ad-blocker hard wall
    When the reader opens a page whose only wall is that one
    Then the page loads

  @unit @visual
  Scenario: The reading settings belong together
    Then "Open the best match automatically" and "Show the publisher icons" sit under "Reading"
    And each carries one sentence about what it changes

  @unit @visual
  Scenario: The theme choice offers the system and the two themes
    Then the page offers "System", "Light", and "Dark"
    And the chosen one is marked
    When the reader chooses another
    Then every page follows it

  @unit
  Scenario: Clearing the cache asks first and reports what it dropped
    When the reader presses "Clear cache"
    Then the page asks "Clear the cached list, the page reads, and the answers?"
    When the reader confirms
    Then the list, every page read, and every answer are dropped
    And the settings, the allowances, the scope defaults, and the tab records stay
    And the worker downloads the list again
    But a failed download leaves the bundled copy in use
    And the page reports how many keys it dropped
    And the button waits for the answer before it takes another press

  @unit
  Scenario: A write reaches the worker, never the store directly
    When the reader changes a setting
    Then one message carries the whole settings record
    And the page writes no key itself
