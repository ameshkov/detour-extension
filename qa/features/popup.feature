Feature: The popup answers for the page it is opened over
  The popup paints one state that the service worker built for the active tab.
  It reads no storage and no tab itself, and its digits and arrows work the way
  the digits work on the block page.

  Background:
    Given Detour is enabled

  @e2e
  Scenario: The header carries the state word and the switch
    Then the header shows the mark, the wordmark, and "On"
    And the switch is on

  @e2e @visual
  Scenario: A listed page shows its card, its walls, its routes, and the search
    Given the reader is on a listed article that loads
    Then the card shows the domain and one sentence about the walls
    And the card shows one pill per wall
    And the section lists one row per alternative with its digit and arrow
    And the search card closes the list with the last digit

  @e2e @visual
  Scenario: An unlisted page offers the report and the search
    Given the reader is on a page that the list does not carry
    Then the card reads "This site is not on the list"
    And the report row reads "If you see a wall here, report it." with the digit 1
    And the search card reads "Search the same story elsewhere" with the digit 2

  @e2e @visual
  Scenario: A page with no site says why the popup is empty
    Given the reader is on a browser page, such as the settings
    Then the header still shows the state and the switch
    And the main area reads "Detour works on websites. Open a site, then press the icon again."
    And the footer still carries the two links, the theme, and the gear

  @manual @visual
  Scenario: The popup on the block page shows the frame alone
    Given the reader is on the Detour block page
    Then the main area is empty
    But the state word and the switch are drawn

  @unit @visual
  Scenario: The frame holds back a switch it cannot stand behind
    Given the state request is still running
    Then the loading line is shown
    And the switch, the state word, and the theme control are absent
    And the two links and the gear already work

  @unit
  Scenario: A state request that fails says so
    Then the popup reads "Detour could not read this page."
    And the switch and the state word stay absent

  @e2e
  Scenario: The switch writes the settings and asks for the state again
    When the reader turns the switch off
    Then the worker stores the setting
    And the popup asks for the state again instead of trusting the press
    And the header reads "Off"
    And a listed page keeps its card and offers no search
    But an unlisted page keeps the frame alone

  @e2e
  Scenario: The popup keeps the switch state across a reload
    Given the reader turned Detour off
    When the popup is loaded again
    Then the header reads "Off"
    And the switch is off

  @unit
  Scenario: A digit opens the row whose number it names
    Given the results state is on screen with three routes
    When the reader presses 2
    Then the second route opens
    And the popup closes

  @unit
  Scenario: The arrows move the selection and Enter opens it
    When the reader presses ArrowDown twice and Enter
    Then the second row carries the selection
    And the second route opens

  @unit
  Scenario: The hidden rows of a long answer still answer their digit
    Given an answer with four routes, of which three fit the frame
    Then the list scrolls instead of growing
    And the wheel scrolls it
    And the fourth digit opens the fourth route

  @unit
  Scenario: A focused control keeps Enter
    Given the reader tabbed onto a route
    When the reader presses Enter
    Then the browser opens that link once
    And the popup adds no second press

  @e2e
  Scenario: A route press moves the page and closes the popup
    Given the popup was opened over the listed article
    When the reader presses the first route
    Then the tab moves to that route
    And the popup closes, because the page it answered for is gone

  @unit
  Scenario: The search card opens the engines in place
    When the reader presses the search card
    Then the card is replaced by the four engine links
    And the first engine holds the focus
    And a digit picks another engine

  @unit
  Scenario: The report row opens a prefilled issue in a new tab
    When the reader presses the report row
    Then a new tab opens the issue form
    And the form names the page, the list identifier, and the build

  @e2e @visual
  Scenario: The footer keeps one row at 340 pixels
    Then the window is 340 px wide and the body is no wider
    And "How it works" and "Privacy" sit on the left
    And the theme and the gear sit on the right of the same row
    And the window never scrolls sideways

  @unit
  Scenario: The popup reads no storage and no tab
    When the popup renders a state
    Then it read no key from the local or the session store
    And it asked the browser for no tab

  @manual
  Scenario: The popup wakes a worker that Chrome stopped
    Given the browser stopped the service worker for being idle
    When the reader opens the popup
    Then the worker starts, reads the stored list, and answers
    And the popup paints the same state as before the stop
