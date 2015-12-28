"use strict";
define(function(){
	function defClass(
		base,   // [constructor function; optional]
		mixins,	// [array of constructor functions and/or objects --or-- hash of names to constructor functions and/or objects; optional]
		members // [function _or_ object; required]
	){
		// juggle...
		if(!members){
			if(!mixins){
				// one argument...
				members = base;
				base = null;
				mixins = null;
			}else{
				// two arguments
				if(typeof base === "function"){
					// base and members
					members = mixins;
					mixins = null;
				}else{
					// mixins and members
					members = mixins;
					mixins = base;
					base = null;
				}
			}
		}

		// if mixins is a hash (i.e., not an array), then pull the names out and convert mixins to an array
		var mixinNames = [];
		if(mixins && !Array.isArray(mixins)){
			mixins = Object.keys(mixins).map(function(name){
				mixinNames.push(name);
				return mixins[name];
			})
		}

		// pull the prototypes from the base (if any) and all the mixins (if any)
		var mixinPrototypes = [],
			pullNames = mixinNames.length == 0;
		if(mixins){
			mixins.forEach(function(mixin){
				if(typeof mixin === "function"){
					mixinPrototypes.push(mixin.prototype);
					if(pullNames){
						mixinNames.push(mixin.className);
					}
				}else{
					mixinPrototypes.push(mixin);
					if(pullNames){
						mixinNames.push(mixin.statics && mixin.statics.className);
					}
				}
			});
		}

		// if members is a factory, then compute the members...
		var membersFactory = null;
		if(typeof members === "function"){
			membersFactory = members;
			members = membersFactory.apply(null, base ? [base.prototype].concat(mixinPrototypes) : mixinPrototypes);
		}

		// build the prototype
		var prototype = base ? Object.create(base.prototype) : {},
			seen = {},
			memberNames = Object.getOwnPropertyNames(members),
			ignoreNames = memberNames.reduce(
				function(result, value){
					result[value] = 1;
					return result;
				},
				{constructor: 1, initializer: 1, statics: 1, defPrivate: 1}
			);
		mixinPrototypes.forEach(function(mixin, mixinIndex){
			Object.getOwnPropertyNames(mixin).forEach(function(name){
				if(!ignoreNames[name]){
					if(seen[name]){
						throw("mixin name clash: name=" + name + "; mixin #" + seen[name] + " and mixin " + mixinNames[i - 1]);
					}else{
						seen[name] = mixinNames[mixinIndex] || ("#" + mixinIndex);
					}
					if(typeof mixin[name] === "object"){
						Object.defineProperty(prototype, name, mixin[name]);
					}else{
						var descriptor = Object.getOwnPropertyDescriptor(mixin, name);
						Object.defineProperty(prototype, name, descriptor);
					}
				}
			})
		});

		var statics = null,
			explicitConstructor = null;
		memberNames.forEach(function(name){
			if(name == "statics"){
				statics = members.statics;
			}else if(name == "explicitConstructor"){
				explicitConstructor = members.explicitConstructor;
			}else{
				if(typeof members[name] === "object"){
					Object.defineProperty(prototype, name, members[name]);
				}else{
					prototype[name] = members[name];
				}
			}
		});

		if(!prototype.defPrivate){
			Object.defineProperty(prototype, "defPrivate", {
				value: function(name, value, getter, setter){
					var definition = {
						writable: true,
						value: value
					};
					if(getter){
						definition.get = getter
					}
					if(setter){
						definition.set = setter;
					}
					Object.defineProperty(this, name, definition);
				}
			});
		}

		//compute the initializers, if any
		var initializers = [];
		if(mixins){
			mixinPrototypes.forEach(function(mixinPrototype){
				if(typeof mixinPrototype.initializer === "function"){
					initializers.push(mixinPrototype.initializer)
				}
			});
		}
		if(members.initializer){
			initializers.push(members.initializer)
		}
		var initializersCount = initializers.length;

		// define the canonical constructor, canonically
		var constructor = prototype.constructor = function(){
			return constructor._instanceFactory(prototype, arguments);
		};
		constructor.prototype = prototype;

		// decorate the constructor
		if(statics){
			Object.getOwnPropertyNames(statics).forEach(function(name){
				if(typeof statics[name] === "object"){
					Object.defineProperty(constructor, name, statics[name]);
				}else{
					constructor[name] = statics[name];
				}
			});
		}
		if(!constructor.members){
			Object.defineProperty(constructor, "members", {enumerable: true, value: membersFactory || members});
		}
		if(!constructor.super && base){
			// therefore, this.constructor.super (this an instance of this class) points to the base prototype
			Object.defineProperty(constructor, "super", {enumerable: true, value: base.prototype});
		}
		if(!constructor.mixins && mixinNames.length){
			// therefore, this.constructor.mixin.A (this an instance of this class) points to the prototype/object of mixin with the name A
			var mixinsRef = {};
			mixinNames.forEach(function(name, i){
				if(name){
					mixinsRef[name] = mixinPrototypes[i];
				}
			});
			Object.defineProperty(constructor, "mixins", {enumerable: true, value: mixinsRef});
		}
		if(constructor._instanceFactory){
			// custom instance factory provided; therefore, all done
			return constructor;
		}

		// define an instance factory depending upon the kind of base class

		if(explicitConstructor){
			// explicit constructors take full responsibility initializing the object with the exception of postCreate
			// if you want to squelch postCreate, provide a member postCreate that is a no-op
			constructor._instanceFactory = function(targetPrototype, args){
				var defaultResult = Object.create(targetPrototype),
					overrideResult = explicitConstructor.apply(defaultResult, args),
					result = overrideResult || defaultResult;
				if(targetPrototype === prototype && result.postCreate){
					prototype.postCreate.apply(result, args);
				}
				return result;
			}
		}else if(base){
			if(base._instanceFactory){
				// base was created by defClass...
				constructor._instanceFactory = function(targetPrototype, args){
					var result = base._instanceFactory(targetPrototype, args);
					for(var i = 0; i < initializersCount;){
						initializers[i++].apply(result, args);
					}
					if(targetPrototype === prototype && result.postCreate){
						prototype.postCreate.apply(result, args);
					}
					return result;
				}
			}else{
				// base was a canonical JavaScript constructor; therefore, not defined by defClass
				constructor._instanceFactory = function(targetPrototype, args){
					// this will work most of the time; when you absolutely have to use new, write an explicit constructor
					var result = base.apply(Object.create(targetPrototype), args);
					for(var i = 0; i < initializersCount;){
						initializers[i++].apply(result, args);
					}
					if(targetPrototype === prototype && result.postCreate){
						prototype.postCreate.apply(result, args);
					}
					return result;
				}
			}
		}else{
			// we're a base class
			constructor._instanceFactory = function(targetPrototype, args){
				var result = Object.create(targetPrototype);
				for(var i = 0; i < initializersCount;){
					initializers[i++].apply(result, args);
				}
				if(targetPrototype === prototype && result.postCreate){
					prototype.postCreate.apply(result, args);
				}
				return result;
			}
		}

		return constructor;
	}

	return defClass;
});
