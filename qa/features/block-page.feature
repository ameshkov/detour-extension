Feature: The block page shows the stopped page and its alternatives
  The block page replaces the article and answers three questions: which site
  stopped the reader, which walls it carries, and where the same story is
  available without one. It reads no storage and paints one state that the
  service worker built.

  Background:
    Given the reader opened a listed article and the guard stopped it
    And the worker recorded the tab and answered the page with one state

  @e2e @visual
  Scenario: The page names the site and counts its walls
    Then the card shows the Detour mark and the wordmark
    And the header reads "1 wall detected"
    And the headline reads "CNET puts a wall in front of this story"
    And the tab is named "Detour — CNET"

  @e2e @visual
  Scenario: An ad-blocker wall carries the judgement sentence
    Then the line under the headline reads "An ad-blocker wall is an anti-user practice"
    But a site whose only wall is a paywall shows no judgement line

  @e2e @visual
  Scenario: The source card names the page that was stopped
    Then the card shows the host in ink and the path in grey
    And it shows the story title on one line
    And it shows the description of the page under the title
    And the copy control sits at the end of the address line

  @unit @visual
  Scenario: The source card keeps a letter when the publisher icon is unusable
    Given the publisher serves a 16 px transparent icon at its fallback address
    Then the card shows one letter on the colour of the domain
    But a publisher icon that is large enough replaces the letter when it loads
    And the card never shows an empty square while the icon is on its way

  @unit
  Scenario: A title that only repeats the address is not drawn
    Given the stopped page wrote its title after the guard stopped it
    Then the card shows no title line
    And the address above it is unchanged

  @e2e @visual
  Scenario: Each wall is one pill and carries its detail
    Then the card shows one pill per wall under "Walls on site"
    And the pill names the category and takes the tint of the category
    When the reader presses a pill
    Then the detail names the wall type and the note from the list
    And it names the checked date when the list carries one
    And the detail offers "Report inaccurate wall detection"

  @e2e @visual
  Scenario: The routes lead with a heading, a count, and one row each
    Then the heading reads "Alternative routes"
    And the count names the routes and the search card
    And each row shows a tile, a title, a description, and the domain
    And each row shows its digit and an arrow at the end

  @unit
  Scenario: A route earns "No walls" only for the address the list clears
    Then a route whose exact address the list does not carry shows "No walls"
    But a route on a domain that the list carries shows no claim

  @unit @e2e
  Scenario: A route says how closely it matches the story
    Then each row ends its line with the match that the analysis gave
    And the row reads "Same story" for the same article
    And a row whose page the analysis could not place shows no match

  @unit @e2e
  Scenario: The story of the answer sits at the end of the keyboard line
    Given the answer names the story of the article
    Then the line under the routes ends with "Topic: <the story>"
    But an answer without a story leaves the keyboard line alone

  @e2e
  Scenario: The search card closes the list and opens four engines
    Then the last row reads "Search the same story elsewhere"
    When the reader presses it
    Then the row is replaced by the four engine links
    And the first engine holds the focus

  @unit
  Scenario: Publisher markup is written as text
    Given an answer whose title carries a script tag
    Then the row shows the tag as characters
    And the page draws no image from that answer

  @unit @visual
  Scenario: The open control waits for the answer
    Given the search is still running
    Then "Go back" is drawn with its key
    But the open control is absent
    And the theme control is absent
    When the answer arrives
    Then "Open CNET anyway" is drawn with its scope
    And the theme control is drawn

  @e2e @visual
  Scenario: The page shows an answer it found nothing for
    Given the answer carries no alternatives
    Then the section reads "No alternatives found for this story"
    And the engines and the retry are shown
    And the status line under the heading is not empty

  @e2e @visual
  Scenario: The page says when the search failed
    Given the backend answers with a failure
    Then the section reads "The search did not finish. This is our problem, not the publisher's."
    And the engines and the retry are shown

  @e2e
  Scenario: The retry asks the worker for the state again
    Given the failed state is on screen
    When the reader presses the retry
    Then the section shows the loading line
    And one more state request reaches the worker

  @e2e @visual
  Scenario: The slow note offers a way out while the search runs
    Given the answer takes longer than three seconds
    Then the note appears under the routes
    And it offers "Open <host> instead" and "Keep waiting"
    When the answer arrives
    Then the note disappears

  @unit
  Scenario: The auto-open countdown opens the first route when the reader asked for it
    Given the reading setting "Open the best match automatically" is on
    Then the page counts three, two, one above the first route
    And it opens the first route when the count ends
    And a press on the countdown stops it

  @e2e
  Scenario: The way back skips the stopped article
    When the reader presses "Go back"
    Then the tab shows the page the reader was on before the article

  @unit
  Scenario: The way out stores the allowance before the tab moves
    When the reader presses "Open CNET anyway"
    Then the allowance is stored for this tab before the tab moves
    And a failed message tells the reader that the site did not open

  @unit
  Scenario: The scope menu offers the four choices and starts on the kept one
    Then the menu offers "This tab", "Just once", "This site until restart", and "This site always"
    And each choice carries a sentence about what it covers
    And it starts on the choice that the reader kept for the domain

  @e2e @visual
  Scenario: The scope menu opens inside a short viewport
    Given the window is shorter than the card
    Then the menu opens above its control and stays inside the window

  @unit
  Scenario: The copy control writes the whole address
    When the reader presses the copy control
    Then the clipboard holds the stopped address
    And the control reads "Copied" for two seconds

  @unit
  Scenario: The report opens a prefilled issue
    When the reader presses "Report a problem"
    Then a new tab opens the project's issue form
    And the form names the site, the address, the list identifier, and the build

  @unit
  Scenario: A page without its tab record says what is missing
    Given the worker has no record for the tab and the address
    Then the headline and the source card are drawn
    And one line names the missing record
    And "Open the article again" links to the article
    And the theme control is absent

  @unit
  Scenario: A retired run paints nothing
    Given a newer run owns the document
    When the older answer arrives
    Then the page is unchanged

  @unit
  Scenario: A framed copy of the block page draws nothing
    Given the block page is framed by another page
    Then the page sends no message
    And it paints nothing

  @manual @visual
  Scenario: A phone width keeps the card readable
    Given the window is 360 px wide
    Then the card loses its outer padding but keeps its sections
    And a row keeps its title on two lines and drops the description
    And the digits and the arrows are dropped, because a phone has no keyboard

  @manual @visual
  Scenario: The dark theme keeps every tone
    Given the reader chose the dark theme, or the system is dark
    Then the card, the pills, the rows, and the footnote keep their contrast
    And the theme control names the theme it moves to
