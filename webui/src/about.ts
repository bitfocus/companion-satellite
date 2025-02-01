declare const aboutApi: typeof import('../../satellite/dist/aboutPreload.cjs').aboutApi

const bug_report = document.querySelector('.bug-report-link') as HTMLDivElement
bug_report.addEventListener('click', (e) => {
	e.preventDefault()
	aboutApi.openShell('https://github.com/bitfocus/companion-satellite/issues').catch((e) => {
		console.error('failed to open bug report url', e)
	})
})

const open_home = () => {
	aboutApi.openShell('https://github.com/bitfocus/companion-satellite').catch((e) => {
		console.error('failed to open homepage url', e)
	})
}

const title_elem = document.querySelector('.title') as HTMLHeadingElement
// title_elem.innerText += ` ${version}`

title_elem.addEventListener('click', open_home)
title_elem.classList.add('clickable')
const logo_elem = document.querySelector('.logo') as HTMLHeadingElement
logo_elem.addEventListener('click', open_home)
logo_elem.classList.add('clickable')

const yearElm = document.querySelector('#year') as HTMLSpanElement
yearElm.innerText = new Date().getFullYear().toString()

aboutApi
	.getVersion()
	.then((version) => {
		console.log('eaa', version)
		title_elem.innerText += ` ${version}`
	})
	.catch((e) => {
		console.error('failed to get version', e)
	})
