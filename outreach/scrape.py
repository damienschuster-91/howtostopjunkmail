#!/usr/bin/env python3
"""
Backlink research scraper for HowToStopJunkMail.org
Uses verified URLs from search research to find .gov/.edu junk mail pages.
"""

import requests
from bs4 import BeautifulSoup
import re
import csv
import time
import os
from urllib.parse import urljoin, urlparse

OUTPUT_CSV = os.path.join(os.path.dirname(__file__), 'gov_edu_targets.csv')
ERRORS_CSV = os.path.join(os.path.dirname(__file__), 'errors.csv')
DELAY = 1.0

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
}

# Verified URLs from search research
URLS = [
    # Federal .gov
    'https://consumer.ftc.gov/how-stop-junk-mail',
    'https://consumer.ftc.gov/articles/prescreened-credit-insurance-offers',
    'https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business',
    'https://www.epa.gov/recycle/paper-recycling',
    'https://archive.epa.gov/epawaste/conserve/smm/wastewise/web/html/prevent.html',
    'https://www.cisa.gov/news-events/news/reducing-spam',
    # State .gov
    'https://www.mass.gov/guides/consumer-guide-to-stopping-junk-mail',
    'https://www.michigan.gov/consumerprotection/protect-yourself/consumer-alerts/id-theft-telemarketing/reduce-junk-mail',
    'https://portal.ct.gov/dcp/common-elements/consumer-facts-and-contacts/reducing-junk-mail',
    'https://datcp.wi.gov/Pages/Publications/JunkMailUnwantedCalls140.aspx',
    'https://ncdoj.gov/protecting-consumers/mail-cable-tv/reduce-junk-mail/',
    'https://consumer.sd.gov/fastfacts/junkmail.aspx',
    'https://consumer.sd.gov/fastfacts/OptOut.aspx',
    # City .gov
    'https://www.oregonmetro.gov/tools-living/garbage-and-recycling/reduce-waste-home/stop-junk-mail',
    'https://www.seattle.gov/utilities/protecting-our-environment/sustainability-tips/waste-prevention/at-home/stop-junk-mail',
    'https://seattle.gov/utilities/protecting-our-environment/sustainability-tips/waste-prevention/at-work/reduce-paper-waste',
    'https://www.sanjoseca.gov/your-government/departments-offices/environmental-services/recycling-garbage/waste-reduction/stop-junk-mail',
    'https://bellevuewa.gov/city-government/departments/utilities/manage-your-utility-services/solid-waste/stop_junk_mail_and_reduce_paper_waste',
    'https://www.longbeach.gov/lbrecycles/waste-reduction/reduce-waste/no-more-junk-mail/',
    'https://www.friscotexas.gov/549/Save-Paper-Reduce-Junk-Mail',
    'https://www.azusaca.gov/457/Reduce-Junk-Mail',
    'https://www.in.gov/idem/recycle/resources/junk-mail/junk-mail-ideas-for-businesses/',
    'https://www.carvercountymn.gov/departments/public-services/environmental-services/reduce/junk-mail',
    'https://nyassembly.gov/comm/Consumer/20080501v/',
    'https://clallamcountywa.gov/DocumentCenter/View/4782/Informational-Bulletin-on-Opting-out-of-Unsolicited-Offers-PDF',
    'https://environment.westchestercountyny.gov/wastewater-and-water-division',
    # University / .edu
    'https://sustainability.uw.edu/promote/snapshots/junk-mail-reduction',
    'https://sustainability.ncsu.edu/blog/2019/11/18/making-mail-more-sustainable/',
    'https://www.canr.msu.edu/news/greening_your_future_part_one_junk_mail',
    'https://mailservices.berkeley.edu/sustainability',
    'https://mail.business-services.upenn.edu/policies/sustainability',
    'https://www.bowdoin.edu/campus-services/mail-center/sustainability.html',
    'https://www.d.umn.edu/sustainability/news/junk-mail',
    'https://news.d.umn.edu/umd/articles/junk-mail',
    'https://tech.wayne.edu/kb/communication-collaboration/wayne-connect/175962',
    'https://www.minotstateu.edu/sustain/pages/tip-junk-mail.shtml',
    'https://blogs.colgate.edu/sustainability/2016/09/15/is-unsolicited-campus-mail-getting-you-down-heres-what-you-can-do/',
    'https://www.macalester.edu/mailing-services/junk-mail/',
    'https://www.colorado.edu/ecenter/programs/zero-waste-programs-and-events/reduce/waste-reduction-tips',
    'https://pubs.nmsu.edu/_g/G107/index.html',
    'https://fieldreport.caes.uga.edu/publications/C1050-1/reduce/',
    'https://extension.uga.edu/publications/detail.html?number=C1050-1&title=reduce',
    'https://sustainability.umw.edu/how-you-can-help/waste-reduction-tips/',
    'https://facsustainability.uncg.edu/action-areas/waste-reduction-and-recycling/',
    'https://green.harvard.edu/news/get-less-junk-mail',
    'https://sustainability.yale.edu/blog/how-stop-junk-mail',
    'https://greenprograms.cornell.edu/tips/reduce-junk-mail',
    'https://housing.ufl.edu/living-on-campus/sustainability/',
    'https://www.sustainability.pitt.edu/action-guides/',
    'https://extension.unh.edu/blog/2016/01/reduce-your-junk-mail',
]

EMAIL_RE = re.compile(r'[\w.+\-]+@[\w.\-]+\.(gov|edu|org|com)', re.IGNORECASE)
PHONE_RE = re.compile(r'\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}')

session = requests.Session()
session.headers.update(HEADERS)


def scrape_page(url):
    try:
        r = session.get(url, timeout=14, allow_redirects=True)
        if r.status_code == 404:
            return None, 'HTTP 404'
        if r.status_code != 200:
            return None, f'HTTP {r.status_code}'
        ct = r.headers.get('Content-Type', '')
        if 'pdf' in ct.lower() or url.lower().endswith('.pdf'):
            return None, 'PDF'
        if 'text/html' not in ct and 'text/plain' not in ct:
            return None, f'Non-HTML'

        soup = BeautifulSoup(r.text, 'lxml')
        text = soup.get_text(' ', strip=True)

        title = ''
        if soup.title and soup.title.string:
            title = soup.title.string.strip()

        parsed = urlparse(r.url)  # use final URL after redirect
        domain = parsed.netloc.lower()
        page_type = 'gov' if domain.endswith('.gov') else 'edu'

        # Org name
        clean = domain
        for strip in ['www.','sustainability.','green.','recycling.','extension.',
                      'mail.business-services.','mailservices.','housing.','news.',
                      'blogs.','tech.','archive.','consumer.','portal.','fieldreport.caes.',
                      'pubs.','facsustainability.']:
            clean = clean.replace(strip, '')
        org_name = clean.split('.')[0].replace('-', ' ').title()

        # Emails - filter junk
        raw_emails = list(set(EMAIL_RE.findall(text)))
        emails = [e for e in raw_emails
                  if not any(e.lower().endswith(x) for x in ['.png','.jpg','.gif','.svg','.css','.js'])]
        emails_str = '; '.join(sorted(set(emails))[:5])

        # Contact page links
        contact_links = []
        for a in soup.find_all('a', href=True):
            href = a['href']
            if re.search(r'\bcontact\b|\bfeedback\b', href, re.IGNORECASE):
                full = urljoin(r.url, href)
                if urlparse(full).netloc == parsed.netloc:
                    contact_links.append(full)
        contact_links_str = '; '.join(list(dict.fromkeys(contact_links))[:3])

        # Phones
        phones = list(set(PHONE_RE.findall(text)))
        phones_str = '; '.join(phones[:3])

        # Department
        dept = ''
        for tag in soup.find_all(['h1', 'h2', 'h3']):
            t = tag.get_text()
            for kw in ['Sustainability','Public Works','Environment','Recycling',
                       'Waste','Library','Mail','Consumer','Housing','Facilities']:
                if kw.lower() in t.lower():
                    dept = kw
                    break
            if dept:
                break

        tl = text.lower()
        row = {
            'page_url':        r.url,
            'page_title':      title[:120],
            'organization_name': org_name,
            'type':            page_type,
            'emails':          emails_str,
            'contact_page_urls': contact_links_str,
            'phone_numbers':   phones_str,
            'department':      dept,
            'does_it_link_to_paperkarma':   'yes' if 'paperkarma' in tl else 'no',
            'does_it_link_to_dmachoice':    'yes' if 'dmachoice' in tl else 'no',
            'does_it_link_to_catalogchoice':'yes' if 'catalogchoice' in tl else 'no',
            'page_summary':    '',
        }

        meta = soup.find('meta', attrs={'name': 'description'})
        if meta and meta.get('content'):
            row['page_summary'] = meta['content'][:200].replace('\n', ' ').strip()
        else:
            p = soup.find('p')
            if p:
                row['page_summary'] = p.get_text()[:200].replace('\n', ' ').strip()

        return row, None

    except requests.exceptions.Timeout:
        return None, 'Timeout'
    except requests.exceptions.ConnectionError as e:
        return None, f'Connection error'
    except Exception as e:
        return None, str(e)[:80]


def main():
    print('=== HowToStopJunkMail.org — Backlink Research ===\n')
    print(f'Scraping {len(URLS)} URLs...\n')

    results = []
    errors  = []
    seen    = set()

    fieldnames = ['page_url','page_title','organization_name','type','emails',
                  'contact_page_urls','phone_numbers','department',
                  'does_it_link_to_paperkarma','does_it_link_to_dmachoice',
                  'does_it_link_to_catalogchoice','page_summary']

    for i, url in enumerate(URLS, 1):
        if url in seen:
            continue
        seen.add(url)
        print(f'[{i:02}/{len(URLS)}] {url[:85]}')
        row, err = scrape_page(url)
        if row:
            results.append(row)
            em = f'  email: {row["emails"][:50]}' if row['emails'] else ''
            ph = f'  phone: {row["phone_numbers"][:30]}' if row['phone_numbers'] else ''
            print(f'  ✓ {row["organization_name"]} ({row["type"]}){em}{ph}')
        else:
            errors.append({'url': url, 'error': err})
            print(f'  ✗ {err}')
        time.sleep(DELAY)

    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)

    with open(ERRORS_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['url','error'])
        writer.writeheader()
        writer.writerows(errors)

    gov_c  = sum(1 for r in results if r['type'] == 'gov')
    edu_c  = sum(1 for r in results if r['type'] == 'edu')
    em_c   = sum(1 for r in results if r['emails'])
    dmac   = sum(1 for r in results if r['does_it_link_to_dmachoice'] == 'yes')
    catc   = sum(1 for r in results if r['does_it_link_to_catalogchoice'] == 'yes')
    pk     = sum(1 for r in results if r['does_it_link_to_paperkarma'] == 'yes')

    print(f'\n{"="*52}')
    print(f'SUMMARY')
    print(f'  Total scraped:          {len(results)}')
    print(f'  .gov pages:             {gov_c}')
    print(f'  .edu pages:             {edu_c}')
    print(f'  With direct emails:     {em_c}')
    print(f'  Link to DMAchoice:      {dmac}')
    print(f'  Link to CatalogChoice:  {catc}')
    print(f'  Link to PaperKarma:     {pk}')
    print(f'  Errors/skipped:         {len(errors)}')
    print(f'\n  ✓ {OUTPUT_CSV}')

if __name__ == '__main__':
    main()
