import {expect,it} from 'vitest'
import {rowKey} from '../../src/core/changes'

it('non-finite SQL keys have distinct identities',()=>{
	expect(new Set([Infinity,-Infinity,null].map(id=>rowKey({id})))).toHaveLength(3)
})
